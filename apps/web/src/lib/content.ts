/** Published facts shared by the trust, compliance and security pages. Keep them accurate. */

export const SUBPROCESSORS = [
  {
    name: 'Phala Network (Phala Cloud)',
    purpose:
      'Confidential VM hosting for the Sealcode gateway, dashboard and database; attested inference gateway',
    data: 'Prompts and completions (processed inside TEEs, not retained); account and usage metadata',
    location: 'Confirmed per region at launch',
  },
  {
    name: 'Phala TEE model providers',
    purpose: 'Serving sealcode-pro (GLM 5.3) in GPU TEEs, verified per request',
    data: 'Prompts and completions, processed inside TEEs with zero data retention',
    location: 'Varies by route; shown in each receipt',
  },
  {
    name: 'NEAR AI',
    purpose:
      'Serving sealcode-fast (GLM 5.3 Flash) in GPU TEEs through Phala, verified per request',
    data: 'Prompts and completions, processed inside TEEs with zero data retention',
    location: 'Varies by route; shown in each receipt',
  },
  {
    name: 'Resend',
    purpose: 'Transactional email: sign-in links, invitations, budget alerts',
    data: 'Names and email addresses; never prompts or code',
    location: 'United States',
  },
  {
    name: 'Cloudflare',
    purpose: 'DNS records for certificate issuance (no traffic is proxied)',
    data: 'None',
    location: 'Global',
  },
] as const;

export const CAN_SEE = [
  'Which member and key made each request, and when',
  'Model alias, token counts, latency and status',
  'The Phala receipt ID for each response',
  'Your organisation’s members, roles, budgets and billing details',
];

export const CANNOT_SEE = [
  'Your prompts, code or completions: they are never logged or stored',
  'The contents of enclave memory, even with root access to the host',
  'Anything Claude Code does on your laptop that isn’t sent as a request',
];
