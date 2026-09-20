import { type RequestHandler } from '@sveltejs/kit';
import { getSession } from '$lib/translation/queue';
import { buildTranslatedEpub } from '$lib/epub/builder';

export const GET: RequestHandler = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('sessionId is required', { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) {
    return new Response('Session not found or expired', { status: 404 });
  }

  try {
    const epubBuffer = await buildTranslatedEpub(session);

    // Format output filename
    const baseName = session.metadata.title
      ? session.metadata.title.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_')
      : session.originalFilename.replace(/\.epub$/i, '');
    const filename = `${baseName}-ID.epub`;

    return new Response(new Uint8Array(epubBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/epub+zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': epubBuffer.length.toString(),
        'Cache-Control': 'no-cache'
      }
    });
  } catch (err: any) {
    console.error('Error building EPUB for download:', err);
    return new Response(`Failed to export EPUB: ${err.message}`, { status: 500 });
  }
};
