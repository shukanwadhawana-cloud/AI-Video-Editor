# HyperFrames for ChatGPT (remote MCP)

A separate remote MCP service that invokes the real HyperFrames CLI to create and render deterministic HTML-to-video compositions. This service does not modify the upstream HeyGen HyperFrames repository.

## MCP endpoint

- HTTP endpoint: POST /mcp (Streamable HTTP, JSON response mode)
- Health: GET /health
- Finished MP4: GET /videos/:projectId

The service fails closed until MCP_API_KEY is configured. Send it as an Authorization Bearer token.

## Tools

- create_video_project: create a self-contained HyperFrames HTML project from a title and ordered scene list, or accept full composition HTML.
- check_video_project: run HyperFrames' lint command and return its output.
- render_video: start a render job using HyperFrames CLI.
- get_render_status: inspect job state and diagnostics.
- get_video: return the downloadable MP4 URL after rendering finishes.
- list_video_projects: list projects available in the persistent data directory.

The default scene template supports landscape 16:9, vertical 9:16 and square 1:1. The render duration is limited to 60 seconds per job and the process enforces a single concurrent render to avoid exhausting the host.

## Runtime

Requires Node.js 22+, FFmpeg, and Chromium. The Dockerfile installs these dependencies and HyperFrames 0.4.x. Mount a persistent Railway volume at /data so project metadata and MP4 outputs survive restarts.

Required environment:
- MCP_API_KEY: long random bearer token; required, never logged.
- PORT: provided by Railway.
- DATA_DIR: defaults to /data.
- PUBLIC_BASE_URL: optional absolute URL if the public Railway domain is not detected.

## Connect to ChatGPT

From ChatGPT on the web, use the account/workspace's custom MCP app/connector settings and enter the public URL ending in /mcp. Configure Bearer authentication with the same MCP_API_KEY. Scan the tools and test a short render.

Custom MCP connector availability depends on ChatGPT plan and workspace permissions. Some plans/workspaces allow only read/fetch tools; a render action may require full MCP write-action support. A custom MCP connector cannot be installed from the ChatGPT iOS app.

## Safety

The MCP endpoint requires an explicit API key, limits request sizes, bounds render duration, validates project identifiers, prevents arbitrary filesystem paths, and serves completed videos by unguessable UUID. Treat composition HTML as executable code and only connect this server to a trusted MCP client.
