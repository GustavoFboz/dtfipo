import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/qa/fixture-acceptance')({
  server: { handlers: { POST: async ({ request }) => {
    const { handleFixtureAcceptance } = await import('@/lib/qa/fixture-acceptance.server');
    return handleFixtureAcceptance(request);
  } } },
});
