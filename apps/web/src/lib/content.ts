/**
 * Published facts shared by the trust, compliance and security pages. Keep them accurate.
 *
 * `tee` says whether this deployment runs in a Phala Confidential VM (see `lib/hosting.ts`). The
 * interim deployment on Railway doesn't, so it must not claim that our gateway, dashboard or
 * database are in a TEE.
 */

interface Subprocessor {
  name: string;
  purpose: string;
  data: string;
  location: string;
}

const MODEL_PROVIDERS: Subprocessor[] = [
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
];

const GOOGLE_ANALYTICS: Subprocessor = {
  name: 'Google (Analytics)',
  purpose: 'Website analytics on our public pages, only for visitors who accept analytics cookies',
  data: 'Pages viewed, device and approximate location; never prompts, code or dashboard data',
  location: 'United States',
};

const RESEND: Subprocessor = {
  name: 'Resend',
  purpose: 'Transactional email: sign-in links, invitations, budget alerts',
  data: 'Names and email addresses; never prompts or code',
  location: 'United States',
};

export function subprocessors(tee: boolean): Subprocessor[] {
  if (tee) {
    return [
      {
        name: 'Phala Network (Phala Cloud)',
        purpose:
          'Confidential VM hosting for the Sealcode gateway, dashboard and database; attested inference gateway',
        data: 'Prompts and completions (processed inside TEEs, not retained); account and usage metadata',
        location: 'Confirmed per region at launch',
      },
      ...MODEL_PROVIDERS,
      RESEND,
      GOOGLE_ANALYTICS,
      {
        name: 'Cloudflare',
        purpose: 'DNS records for certificate issuance (no traffic is proxied)',
        data: 'None',
        location: 'Global',
      },
    ];
  }
  return [
    {
      name: 'Railway',
      purpose:
        'Hosting for the Sealcode gateway, dashboard and database until they move into a Phala Confidential VM',
      data: 'Prompts and completions in transit through the gateway (not logged or retained); account and usage metadata',
      location: 'EU (Netherlands)',
    },
    {
      name: 'Phala Network (Phala Cloud)',
      purpose: 'Attested inference gateway: routes each request only to verified GPU TEEs',
      data: 'Prompts and completions, processed inside TEEs and not retained',
      location: 'Varies by route; shown in each receipt',
    },
    ...MODEL_PROVIDERS,
    RESEND,
    GOOGLE_ANALYTICS,
  ];
}

const METADATA_WE_SEE = [
  'Which member and key made each request, and when',
  'Model alias, token counts, latency and status',
  'The Phala receipt ID for each response',
  'Your organisation’s members, roles, budgets and billing details',
];

export function canSee(tee: boolean): string[] {
  if (tee) return METADATA_WE_SEE;
  return [
    ...METADATA_WE_SEE,
    'Prompts and code in transit through our gateway, which runs on standard cloud hosting until it moves into a Confidential VM. It never logs or stores them, but it isn’t hardware-isolated yet',
  ];
}

export function cannotSee(tee: boolean): string[] {
  if (tee) {
    return [
      'Your prompts, code or completions: they are never logged or stored',
      'The contents of enclave memory, even with root access to the host',
      'Anything Claude Code does on your laptop that isn’t sent as a request',
    ];
  }
  return [
    'Your prompts, code or completions after a request: they are never logged or stored',
    'Inside the model’s GPU enclave, where inference runs, even with root access to the host',
    'Anything Claude Code does on your laptop that isn’t sent as a request',
  ];
}
