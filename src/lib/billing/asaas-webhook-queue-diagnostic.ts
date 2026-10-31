const dentalFlowEndpoint = 'https://dtfipo.lovable.app/api/billing/asaas-webhook';
const reportedQueueName = 'testewebhookunikapos';

export type WebhookQueueMetadata = {
  id?: string | null;
  name?: string | null;
  url: string;
  enabled: boolean;
  interrupted: boolean;
  apiVersion: number;
  sendType: string;
  events: string[];
};

/** Correlate the owner's alert without visiting another system or returning
 * endpoint URLs, contact details, provider payloads or authentication tokens. */
export function summarizeWebhookQueueAlert(items: WebhookQueueMetadata[], hasMore: boolean) {
  const identified = items.map((item, index) => ({
    item, index,
    dentalflow: item.url === dentalFlowEndpoint,
    reported: typeof item.name === 'string'
      && item.name.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '') === reportedQueueName,
  }));
  const dentalflow = identified.filter(x => x.dentalflow);
  const reported = identified.filter(x => x.reported);
  const project = ({ item, dentalflow }: typeof identified[number]) => ({
    id: item.id && (/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id)
      || /^whk_[A-Za-z0-9_-]{1,90}$/.test(item.id)) ? item.id : null,
    enabled: item.enabled,
    interrupted: item.interrupted,
    targets_dentalflow: dentalflow,
    api_version: item.apiVersion,
    send_type: ['SEQUENTIALLY', 'NON_SEQUENTIALLY'].includes(item.sendType) ? item.sendType : null,
    event_count: new Set(item.events).size,
  });
  const correlation = hasMore ? 'incomplete_listing'
    : dentalflow.length > 1 || reported.length > 1 ? 'ambiguous'
      : reported.length === 0 ? 'reported_queue_not_found'
        : dentalflow.length === 0 ? 'dentalflow_queue_not_found'
          : dentalflow[0].index === reported[0].index ? 'same_queue' : 'different_queue';
  return {
    listing_complete: !hasMore,
    total_webhooks: items.length,
    correlation,
    dentalflow: dentalflow.map(project),
    reported_test_queue: reported.map(project),
    delivery_logs_checked: false,
    webhook_configuration_changed: false,
    financial_processing_invoked: false,
  };
}
