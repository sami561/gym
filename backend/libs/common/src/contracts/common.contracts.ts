import { Role } from './auth.contracts';

/** Who performs an action; the gateway adds it to payloads that need an audit trail. */
export interface Actor {
  id: string;
  role: Role;
  name: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface IdRequest {
  id: string;
}

export interface OkResult {
  ok: true;
}

export interface Recipient {
  memberId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
}

export interface HealthResult {
  service: string;
  status: 'ok';
  uptime: number;
}
