import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import express from 'express';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildComposition, getDimensions, slugify, validateCustomComposition } from './composition.js';

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = path.resolve(process.env.DATA_DIR || '/data');
const PROJECTS_DIR = path.join(DATA_DIR, 'projects');
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_RENDER_SECONDS = 60;
const RENDER_TIMEOUT_MS = 15 * 60 * 1000;
const runningRenders = new Map();

await fs.mkdir(PROJECTS_DIR, { recursive: true });
await recoverInterruptedJobs();

function jsonToolResult(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function jsonToolError(message) {
  return { isError: true, content: [{ type: 'text', text: String(message) }] };
}

function projectDirectory(projectId) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) {
    throw new Error('Invalid project_id. Use the UUID returned by create_video_project.');
  }
  return path.join(PROJECTS_DIR, projectId);
}

async function readProject(projectId) {
  const dir = projectDirectory(projectId);
  const raw = await fs.readFile(path.join(dir, 'project.json'), 'utf8');
  return { dir, project: JSON.parse(raw) };
}

async function saveProject(dir, project) {
  const tempFile = path.join(dir, 'project.json.tmp');
  await fs.writeFile(tempFile, JSON.stringify(project, null, 2), { mode: 0o600 });
  await fs.rename(tempFile, path.join(dir, 'project.json'));
}

async function recoverInterruptedJobs() {
  const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/i.test(entry.name)) continue;
    const dir = path.join(PROJECTS_DIR, entry.name);
    try {
      const raw = await fs.readFile(path.join(dir, 'project.json'), 'utf8');
      const project = JSON.parse(raw);
      if (project.render?.status === 'rendering') {
        project.render.status = 'failed';
        project.render.error = 'The service restarted while this render was running. Start a new render.';
        project.render.finished_at = new Date().toISOString();
        await saveProject(dir, project);
      }
    } catch {
      // Ignore incomplete directories; they are not exposed as projects.
    }
  }
}

function absoluteVideoUrl(baseUrl, projectId) {
  return baseUrl.replace(/\/$/, '') + '/videos/' + encodeURIComponent(projectId);
}

function createMcpServer(baseUrl) {
  const server = new McpServer({
    name: 'hyperframes-chatgpt',
    version: '0.1.0'
  });

  server.tool(
    'create_video_project',
    'Create an editable HyperFrames video project from a title and ordered scenes. Supports landscape 16:9, vertical 9:16, and square 1:1. This writes HTML source only; call render_video to render an MP4. For custom compositions, pass composition_html with a valid HyperFrames root.',
    {
      title: z.string().trim().min(1).max(120).describe('Video title.'),
      scenes: z.array(z.object({
        heading: z.string().trim().min(1).max(180).describe('Large on-screen heading for this scene.'),
        body: z.string().max(600).optional().describe('Optional supporting copy shown below the heading.')
      })).min(1).max(10).describe('Ordered scenes. Use 1–10 scenes with concise copy; no voiceover is generated.'),
      duration_seconds: z.number().int().min(5).max(MAX_RENDER_SECONDS).default(15).describe('Total video length in seconds, 5–60.'),
      aspect_ratio: z.enum(['16:9', '9:16', '1:1']).default('16:9').describe('Output aspect ratio.'),
      visual_style: z.enum(['cinematic', 'minimal', 'bold']).default('cinematic').describe('Visual theme.'),
      accent_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#23D5AB').describe('Accent color in #RRGGBB format.'),
      composition_html: z.string().max(MAX_HTML_BYTES).optional().describe('Optional full HTML composition, overriding the default scene template. Must include a valid root element with data-composition-id, data-width, data-height and data-duration matching the chosen aspect ratio.')
    },
    async ({ title, scenes, duration_seconds, aspect_ratio, visual_style, accent_color, composition_html }) => {
      try {
        if (composition_html && Buffer.byteLength(composition_html, 'utf8') > MAX_HTML_BYTES) {
          return jsonToolError('composition_html exceeds the 2 MiB limit.');
        }
        const dimensions = getDimensions(aspect_ratio);
        const id = crypto.randomUUID();
        const dir = projectDirectory(id);
        await fs.mkdir(dir, { recursive: false, mode: 0o700 });
        const html = composition_html || buildComposition({
          title,
          scenes,
          durationSeconds: duration_seconds,
          aspectRatio: aspect_ratio,
          visualStyle: visual_style,
          accentColor: accent_color
        });
        if (composition_html) {
          validateCustomComposition(composition_html, duration_seconds, aspect_ratio);
        }
        await fs.writeFile(path.join(dir, 'index.html'), html, { mode: 0o600 });
        const project = {
          id,
          title,
          created_at: new Date().toISOString(),
          duration_seconds,
          aspect_ratio,
          width: dimensions.width,
          height: dimensions.height,
          visual_style,
          state: 'created',
          render: { status: 'not_started' }
        };
        await saveProject(dir, project);
        return jsonToolResult({
          project_id: id,
          title,
          duration_seconds,
          aspect_ratio,
          dimensions,
          source_file: path.join('projects', id, 'index.html'),
          state: 'created',
          next_step: 'Call check_video_project to validate the HTML, then render_video to create the MP4.'
        });
      } catch (error) {
        return jsonToolError(error?.message || error);
      }
    }
  );

  server.tool(
    'check_video_project',
    'Run the HyperFrames CLI lint check against a project before rendering. Returns the CLI output and whether lint passed.',
    {
      project_id: z.string().uuid().describe('Project UUID from create_video_project.')
    },
    async ({ project_id }) => {
      try {
        const { dir, project } = await readProject(project_id);
        const result = await runCli(dir, ['lint'], 90_000);
        project.last_check = {
          ok: result.code === 0,
          checked_at: new Date().toISOString(),
          exit_code: result.code,
          output: result.output.slice(-12000)
        };
        await saveProject(dir, project);
        return jsonToolResult({
          project_id,
          ok: result.code === 0,
          exit_code: result.code,
          output: result.output.slice(-12000),
          next_step: result.code === 0 ? 'Call render_video to render the MP4.' : 'Fix the reported composition errors before rendering.'
        });
      } catch (error) {
        return jsonToolError(error?.message || error);
      }
    }
  );

  server.tool(
    'render_video',
    'Render a project to MP4 with the installed HyperFrames CLI. Rendering runs asynchronously; call get_render_status with the project_id until status is completed or failed.',
    {
      project_id: z.string().uuid().describe('Project UUID from create_video_project.'),
      quality: z.enum(['draft', 'standard', 'high']).default('standard').describe('Render quality.'),
      fps: z.number().int().min(24).max(60).default(30).describe('Output frames per second.')
    },
    async ({ project_id, quality, fps }) => {
      try {
        const { dir, project } = await readProject(project_id);
        if (project.render?.status === 'rendering') {
          return jsonToolResult({ project_id, status: 'rendering', job_id: project.render.job_id, message: 'A render is already running for this project.' });
        }
        if (project.render?.status === 'completed') {
          const outputPath = path.join(dir, 'video.mp4');
          try {
            await fs.access(outputPath);
            return jsonToolResult({ project_id, status: 'completed', video_url: absoluteVideoUrl(baseUrl, project_id), message: 'The completed MP4 is already available.' });
          } catch {
            // The metadata can outlive a deleted output; start a fresh render below.
          }
        }
        if (runningRenders.size >= 1) {
          return jsonToolError('The renderer is busy with another video. Retry after that job completes.');
        }
        if (project.duration_seconds > MAX_RENDER_SECONDS) {
          return jsonToolError('This server limits render duration to ' + MAX_RENDER_SECONDS + ' seconds per video.');
        }
        const jobId = crypto.randomUUID();
        project.render = {
          job_id: jobId,
          status: 'rendering',
          quality,
          fps,
          started_at: new Date().toISOString(),
          output: ''
        };
        project.state = 'rendering';
        await saveProject(dir, project);
        launchRender(project_id, dir, project, quality, fps, jobId);
        return jsonToolResult({
          project_id,
          job_id: jobId,
          status: 'rendering',
          message: 'HyperFrames render started. Poll get_render_status with the project_id.',
          estimated_duration_seconds: project.duration_seconds
        });
      } catch (error) {
        return jsonToolError(error?.message || error);
      }
    }
  );

  server.tool(
    'get_render_status',
    'Get the latest render status and diagnostic output for a project. Includes the MP4 link once rendering completes.',
    {
      project_id: z.string().uuid().describe('Project UUID returned by create_video_project.')
    },
    async ({ project_id }) => {
      try {
        const { project } = await readProject(project_id);
        const result = {
          project_id,
          title: project.title,
          status: project.render?.status || 'not_started',
          job_id: project.render?.job_id || null,
          started_at: project.render?.started_at || null,
          finished_at: project.render?.finished_at || null,
          output: (project.render?.output || '').slice(-10000),
          error: project.render?.error || null
        };
        if (project.render?.status === 'completed') {
          result.video_url = absoluteVideoUrl(baseUrl, project_id);
        }
        return jsonToolResult(result);
      } catch (error) {
        return jsonToolError(error?.message || error);
      }
    }
  );

  server.tool(
    'get_video',
    'Return the download link for a completed MP4. If the render is still running, returns the current status instead.',
    {
      project_id: z.string().uuid().describe('Project UUID.')
    },
    async ({ project_id }) => {
      try {
        const { dir, project } = await readProject(project_id);
        const outputPath = path.join(dir, 'video.mp4');
        if (project.render?.status !== 'completed') {
          return jsonToolResult({
            project_id,
            status: project.render?.status || 'not_started',
            message: 'The MP4 is not ready yet. Call get_render_status for progress.'
          });
        }
        await fs.access(outputPath);
        return jsonToolResult({
          project_id,
          title: project.title,
          status: 'completed',
          video_url: absoluteVideoUrl(baseUrl, project_id),
          file_name: slugify(project.title) + '.mp4',
          content_type: 'video/mp4',
          duration_seconds: project.duration_seconds,
          resolution: project.width + 'x' + project.height
        });
      } catch (error) {
        return jsonToolError(error?.message || error);
      }
    }
  );

  server.tool(
    'list_video_projects',
    'List video projects in the persistent workspace with render state and downloadable links for completed videos.',
    {},
    async () => {
      try {
        const entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
        const projects = [];
        for (const entry of entries) {
          if (!entry.isDirectory() || !/^[0-9a-f-]{36}$/i.test(entry.name)) continue;
          try {
            const { project } = await readProject(entry.name);
            projects.push({
              project_id: project.id,
              title: project.title,
              created_at: project.created_at,
              duration_seconds: project.duration_seconds,
              aspect_ratio: project.aspect_ratio,
              render_status: project.render?.status || 'not_started',
              video_url: project.render?.status === 'completed' ? absoluteVideoUrl(baseUrl, project.id) : null
            });
          } catch {
            // Skip incomplete project folders.
          }
        }
        projects.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return jsonToolResult({ count: projects.length, projects });
      } catch (error) {
        return jsonToolError(error?.message || error);
      }
    }
  );

  return server;
}

function runCli(cwd, args, timeoutMs) {
  return new Promise((resolve) => {
    const binary = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'node_modules', '.bin', 'hyperframes');
    let child;
    let output = '';
    let settled = false;
    const finish = (code, extra = '') => {
      if (settled) return;
      settled = true;
      if (extra) output += '\n' + extra;
      resolve({ code, output });
    };
    try {
      child = spawn(binary, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-20000); });
      child.stderr.on('data', (chunk) => { output = (output + chunk.toString()).slice(-20000); });
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        finish(124, 'Command timed out after ' + Math.round(timeoutMs / 1000) + ' seconds.');
      }, timeoutMs);
      child.on('error', (error) => {
        clearTimeout(timer);
        finish(127, error.message);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        finish(code ?? 1);
      });
    } catch (error) {
      finish(127, error?.message || error);
    }
  });
}

async function launchRender(projectId, dir, project, quality, fps, jobId) {
  const childId = projectId;
  const outputPath = path.join(dir, 'video.mp4');
  const binary = path.resolve('node_modules/.bin/hyperframes');
  const logPath = path.join(dir, 'render.log');
  let output = '';
  const started = Date.now();
  const child = spawn(binary, ['render', '--output', outputPath, '--quality', quality, '--fps', String(fps)], {
    cwd: dir,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  runningRenders.set(childId, child);
  child.stdout.on('data', (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  child.stderr.on('data', (chunk) => { output = (output + chunk.toString()).slice(-30000); });
  const timeout = setTimeout(() => {
    child.kill('SIGTERM');
  }, RENDER_TIMEOUT_MS);
  const complete = async (status, code, errorMessage = null) => {
    clearTimeout(timeout);
    runningRenders.delete(childId);
    try {
      await fs.writeFile(logPath, output, { mode: 0o600 });
      const current = JSON.parse(await fs.readFile(path.join(dir, 'project.json'), 'utf8'));
      if (current.render?.job_id !== jobId) return;
      current.render.status = status;
      current.render.finished_at = new Date().toISOString();
      current.render.exit_code = code;
      current.render.output = output.slice(-30000);
      if (errorMessage) current.render.error = errorMessage;
      if (status === 'completed') {
        current.state = 'completed';
        const stat = await fs.stat(outputPath);
        current.render.file_size_bytes = stat.size;
      } else {
        current.state = 'failed';
        current.render.error = errorMessage || 'HyperFrames render exited with code ' + code + '.';
      }
      await saveProject(dir, current);
    } catch (error) {
      console.error('Failed to save render result for ' + projectId + ': ' + (error?.message || error));
    }
  };
  child.on('error', (error) => {
    void complete('failed', 127, error.message);
  });
  child.on('close', (code, signal) => {
    if (Date.now() - started >= RENDER_TIMEOUT_MS) {
      void complete('failed', code ?? 124, 'Render exceeded the 15-minute time limit.');
    } else if (code === 0) {
      void complete('completed', 0);
    } else {
      void complete('failed', code ?? 1, 'Render failed' + (signal ? ' with signal ' + signal : '') + '. See output for CLI diagnostics.');
    }
  });
}

function isAuthorized(req) {
  const configured = process.env.MCP_API_KEY;
  if (!configured) return false;
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || ''));
  if (!match) return false;
  const provided = Buffer.from(match[1]);
  const expected = Buffer.from(configured);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Mcp-Session-Id, Last-Event-ID');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});
app.use(express.json({ limit: '3mb' }));

app.get('/health', async (_req, res) => {
  let hyperframes = 'not_checked';
  try {
    await fs.access(path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'node_modules', '.bin', 'hyperframes'));
    hyperframes = 'installed';
  } catch {
    hyperframes = 'missing';
  }
  res.json({
    status: hyperframes === 'installed' && process.env.MCP_API_KEY ? 'ok' : 'misconfigured',
    service: 'hyperframes-chatgpt-mcp',
    hyperframes,
    authentication_configured: Boolean(process.env.MCP_API_KEY),
    active_renders: runningRenders.size,
    max_concurrent_renders: 1
  });
});

app.get('/videos/:projectId', async (req, res) => {
  try {
    const { dir, project } = await readProject(req.params.projectId);
    if (project.render?.status !== 'completed') return res.status(404).json({ error: 'Video not found or not complete.' });
    const outputPath = path.join(dir, 'video.mp4');
    await fs.access(outputPath);
    res.set('Content-Type', 'video/mp4');
    res.set('Content-Disposition', 'attachment; filename="' + slugify(project.title) + '.mp4"');
    res.set('Cache-Control', 'private, max-age=3600');
    return res.sendFile(outputPath);
  } catch {
    return res.status(404).json({ error: 'Video not found.' });
  }
});

app.all('/mcp', async (req, res) => {
  if (!process.env.MCP_API_KEY) {
    return res.status(503).json({ error: 'MCP_API_KEY is not configured. Configure this secret before connecting a client.' });
  }
  if (!isAuthorized(req)) {
    res.set('WWW-Authenticate', 'Bearer');
    return res.status(401).json({ error: 'Unauthorized. Supply Authorization: Bearer <MCP_API_KEY>.' });
  }
  const host = req.get('host');
  const baseUrl = process.env.PUBLIC_BASE_URL || ((req.protocol || 'https') + '://' + host);
  const mcp = createMcpServer(baseUrl);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });
  try {
    await mcp.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('MCP request failed: ' + (error?.message || error));
    if (!res.headersSent) res.status(500).json({ error: 'MCP request failed.' });
  }
});

app.use((error, _req, res, _next) => {
  const status = error?.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({ error: status === 413 ? 'Request body is too large.' : 'Invalid request.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('HyperFrames MCP listening on port ' + PORT);
});
