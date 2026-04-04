import { OAuth2Client, TokenPayload } from 'google-auth-library';

const oauthClient = new OAuth2Client();

export class GoogleAuthError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 401) {
    super(message);
    this.name = 'GoogleAuthError';
    this.statusCode = statusCode;
  }
}

function getGoogleClientId() {
  const clientId = process.env.GOOGLE_CLIENT_ID;

  if (!clientId) {
    throw new GoogleAuthError('Google auth is not configured on the server', 500);
  }

  return clientId;
}

export const googleAuthService = {
  async verifyIdToken(idToken: string): Promise<TokenPayload> {
    const audience = getGoogleClientId();

    let ticket;
    try {
      ticket = await oauthClient.verifyIdToken({
        idToken,
        audience,
      });
    } catch {
      throw new GoogleAuthError('Invalid Google idToken');
    }

    const payload = ticket.getPayload();
    if (!payload) {
      throw new GoogleAuthError('Google idToken payload was missing');
    }

    if (!payload.sub || !payload.email) {
      throw new GoogleAuthError('Google idToken is missing required claims', 400);
    }

    if (payload.exp && payload.exp * 1000 <= Date.now()) {
      throw new GoogleAuthError('Google idToken has expired');
    }

    return payload;
  },
};
