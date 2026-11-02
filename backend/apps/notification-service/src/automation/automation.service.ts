import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  InactiveMember,
  InactiveMembersRequest,
  LastVisit,
  PATTERNS,
  Recipient,
  RpcClient,
  RpcError,
} from '@app/common';
import { composeInactiveMembers } from './inactive-members';

const DEFAULT_INACTIVE_DAYS = 14;

@Injectable()
export class AutomationService {
  constructor(private readonly rpc: RpcClient) {}

  async inactiveMembers({ days }: InactiveMembersRequest): Promise<InactiveMember[]> {
    const threshold = days ?? DEFAULT_INACTIVE_DAYS;
    if (!Number.isInteger(threshold) || threshold < 1 || threshold > 365) {
      throw new BadRequestException('Le nombre de jours doit être compris entre 1 et 365.');
    }
    const recipients = await this.call<Recipient[]>(
      PATTERNS.membershipAutomation.recipients,
      { segment: 'active' },
      'abonnements',
    );
    if (!recipients.length) return [];
    const visits = await this.call<LastVisit[]>(
      PATTERNS.access.lastVisits,
      { memberIds: recipients.map((r) => r.memberId) },
      "contrôle d'accès",
    );
    return composeInactiveMembers(recipients, visits, threshold);
  }

  private async call<T>(pattern: string, data: unknown, label: string): Promise<T> {
    try {
      return await this.rpc.send<T>(pattern, data);
    } catch (err) {
      if (err instanceof RpcError && err.statusCode >= 500) {
        throw new ServiceUnavailableException(`Service ${label} indisponible, réessayez dans un instant.`);
      }
      throw err;
    }
  }
}
