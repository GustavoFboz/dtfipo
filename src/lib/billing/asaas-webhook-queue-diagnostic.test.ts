import { describe, expect, it } from 'vitest';
import { summarizeWebhookQueueAlert, type WebhookQueueMetadata } from './asaas-webhook-queue-diagnostic';

const own: WebhookQueueMetadata = { id: 'whk_dentalflow', name: 'DentalFlow Production',
  url: 'https://dtfipo.lovable.app/api/billing/asaas-webhook', enabled: true, interrupted: false,
  apiVersion: 3, sendType: 'SEQUENTIALLY', events: ['PAYMENT_RECEIVED'] };
const reported: WebhookQueueMetadata = { ...own, id: 'whk_reported', name: 'Teste Webhook Unika POS',
  url: 'https://other.example.invalid/private?auth=not-for-output', interrupted: true };

describe('reported Asaas queue correlation', () => {
  it('separates the interrupted reported integration from the healthy DentalFlow queue', () => {
    const result = summarizeWebhookQueueAlert([own, reported], false);
    expect(result.correlation).toBe('different_queue');
    expect(result.dentalflow).toMatchObject([{ interrupted: false, targets_dentalflow: true }]);
    expect(result.reported_test_queue).toMatchObject([{ interrupted: true, targets_dentalflow: false }]);
    expect(JSON.stringify(result)).not.toMatch(/https:|private\?|auth=|Unika|DentalFlow Production/);
    expect(result.webhook_configuration_changed).toBe(false);
    expect(result.financial_processing_invoked).toBe(false);
  });
  it('reports the same queue when the displayed name belongs to the DentalFlow endpoint', () => {
    expect(summarizeWebhookQueueAlert([{ ...own, name: reported.name, interrupted: true }], false))
      .toMatchObject({ correlation: 'same_queue', reported_test_queue: [{ targets_dentalflow: true, interrupted: true }] });
  });
  it('does not infer a result from missing, duplicated or incompletely listed queues', () => {
    expect(summarizeWebhookQueueAlert([own], false).correlation).toBe('reported_queue_not_found');
    expect(summarizeWebhookQueueAlert([reported], false).correlation).toBe('dentalflow_queue_not_found');
    expect(summarizeWebhookQueueAlert([own, reported, reported], false).correlation).toBe('ambiguous');
    expect(summarizeWebhookQueueAlert([own, reported], true).correlation).toBe('incomplete_listing');
  });
  it('requires the exact normalized alert name and exact DentalFlow URL', () => {
    expect(summarizeWebhookQueueAlert([{ ...reported, name: ' TESTE Webhook   Unika POS ' }, own], false).correlation).toBe('different_queue');
    expect(summarizeWebhookQueueAlert([{ ...reported, name: 'Teste Webhook Unika POS - outra conta' }, own], false).correlation).toBe('reported_queue_not_found');
    expect(summarizeWebhookQueueAlert([{ ...own, url: own.url + '?secret=private' }, reported], false).correlation).toBe('dentalflow_queue_not_found');
  });
  it('redacts arbitrary provider identifiers and unrecognized send modes', () => {
    const result = summarizeWebhookQueueAlert([{ ...own, id: 'private-token-must-not-escape', sendType: 'private-provider-data' }], false);
    expect(result.dentalflow[0]).toMatchObject({ id: null, send_type: null });
    expect(result.delivery_logs_checked).toBe(false);
  });
});
