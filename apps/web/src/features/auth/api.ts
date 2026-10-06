import { authResponseSchema, type LoginInput, type RegisterInput } from '@splinance/shared';
import { http, noContent } from '@/lib/http';

// Credential endpoints are public: a 401 there means wrong credentials, not an expired token.
export const authApi = {
  register: (input: RegisterInput) =>
    http.post('/auth/register', authResponseSchema, input, { auth: false }),
  login: (input: LoginInput) =>
    http.post('/auth/login', authResponseSchema, input, { auth: false }),
  logout: () => http.post('/auth/logout', noContent, undefined, { auth: false }),
};
