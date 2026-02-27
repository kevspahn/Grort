import { householdRepository } from '../repositories/householdRepository';
import { userRepository, UserRow } from '../repositories/userRepository';

export const householdService = {
  async createHousehold(userId: string, name: string) {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error('User not found');
    if (user.household_id) throw new Error('User already belongs to a household');

    const household = await householdRepository.create(name);
    await userRepository.updateHousehold(userId, household.id, 'owner');

    return household;
  },

  async inviteMember(householdId: string, inviterUserId: string, email: string) {
    const inviter = await userRepository.findById(inviterUserId);
    if (!inviter || inviter.household_id !== householdId || inviter.household_role !== 'owner') {
      throw new Error('Only household owners can invite members');
    }

    const invitee = await userRepository.findByEmail(email);
    if (!invitee) throw new Error('User not found with that email');
    if (invitee.household_id) throw new Error('User already belongs to a household');

    await userRepository.updateHousehold(invitee.id, householdId, 'member');
    return invitee;
  },

  async removeMember(householdId: string, ownerUserId: string, targetUserId: string) {
    const owner = await userRepository.findById(ownerUserId);
    if (!owner || owner.household_id !== householdId || owner.household_role !== 'owner') {
      throw new Error('Only household owners can remove members');
    }

    if (ownerUserId === targetUserId) {
      throw new Error('Cannot remove yourself as owner');
    }

    const target = await userRepository.findById(targetUserId);
    if (!target || target.household_id !== householdId) {
      throw new Error('User is not a member of this household');
    }

    await householdRepository.removeMember(householdId, targetUserId);
  },

  async getMembers(householdId: string) {
    return householdRepository.getMembers(householdId);
  },
};
