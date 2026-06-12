// Strava OAuth token broker.
//
// Holds the Strava client secret server-side (Netlify env vars) so it never
// ships inside the iOS app bundle or the static site. Clients send an
// authorization code or refresh token; this function performs the exchange
// against Strava and passes the token response straight through.
//
// Required environment variables (Site settings → Environment variables):
//   STRAVA_CLIENT_ID
//   STRAVA_CLIENT_SECRET

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';

export default async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ message: 'Method not allowed.' }, { status: 405 });
  }

  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.json({ message: 'Strava credentials are not configured on the server.' }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ message: 'Expected a JSON body.' }, { status: 400 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
  });

  if (body.grant_type === 'authorization_code' && typeof body.code === 'string' && body.code) {
    params.set('grant_type', 'authorization_code');
    params.set('code', body.code);
  } else if (body.grant_type === 'refresh_token' && typeof body.refresh_token === 'string' && body.refresh_token) {
    params.set('grant_type', 'refresh_token');
    params.set('refresh_token', body.refresh_token);
  } else {
    return Response.json({ message: 'Unsupported grant. Send authorization_code or refresh_token.' }, { status: 400 });
  }

  const stravaResponse = await fetch(STRAVA_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return new Response(await stravaResponse.text(), {
    status: stravaResponse.status,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/strava/token' };
