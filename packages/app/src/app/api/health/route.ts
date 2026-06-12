export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({
    ok: true,
    service: 'tuteur-dashboard',
    projectRoot: process.env.TUTEUR_PROJECT_ROOT ?? null,
  });
}
