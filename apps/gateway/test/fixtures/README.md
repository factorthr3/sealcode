# Recorded upstream fixtures

Server-sent event transcripts in Anthropic's streaming format, replayed byte for byte by the mock
upstream when a request's last user message contains `MOCK_FIXTURE:<name>`. Contract tests assert
the gateway relays them unchanged apart from the model name.

These were written from Anthropic's published streaming reference. When the live spike runs,
replace them with transcripts recorded from Phala (`pnpm spike` with `SPIKE_RECORD=1`), keeping
the file names.
