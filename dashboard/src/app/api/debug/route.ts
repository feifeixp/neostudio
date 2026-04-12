// Temporary diagnostic endpoint — will be removed after debugging

export async function GET() {
  const hasAK  = !!process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
  const hasSK  = !!process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
  const skLen  = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET?.length ?? 0;
  const hasEP  = !!process.env.TABLESTORE_ENDPOINT;
  const hasOR  = !!process.env.OPENROUTER_API_KEY;

  // Test node:crypto HMAC
  let hmacOk = false;
  let hmacErr = '';
  try {
    const { createHmac } = await import('node:crypto');
    const h = createHmac('sha256', 'test-key').update('hello').digest('hex');
    hmacOk = h.length === 64;
  } catch (e: any) {
    hmacErr = e.message;
  }

  // Test with actual SK value
  let hmacWithSK = false;
  let hmacSKErr = '';
  try {
    const sk = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? '';
    if (sk) {
      const { createHmac } = await import('node:crypto');
      const h = createHmac('sha256', sk).update('hello').digest('hex');
      hmacWithSK = h.length === 64;
    }
  } catch (e: any) {
    hmacSKErr = e.message;
  }

  return Response.json({
    env: { hasAK, hasSK, skLen, hasEP, hasOR },
    crypto: { hmacOk, hmacErr, hmacWithSK, hmacSKErr },
  });
}
