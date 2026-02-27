import { Router, Request, Response } from 'express';
import { authMiddleware, requireHousehold, requireHouseholdOwner } from '../middleware/auth';
import { householdService } from '../services/householdService';
import { CreateHouseholdSchema, InviteMemberSchema } from '../shared/schemas';
import { ZodError } from 'zod';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  try {
    const body = CreateHouseholdSchema.parse(req.body);
    const household = await householdService.createHousehold(req.user!.id, body.name);
    res.status(201).json(household);
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/:id/invite', requireHousehold, requireHouseholdOwner, async (req: Request, res: Response) => {
  try {
    const body = InviteMemberSchema.parse(req.body);
    await householdService.inviteMember(req.params.id, req.user!.id, body.email);
    res.json({ message: 'Member invited successfully' });
  } catch (err) {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', details: err.errors });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/:id/members/:userId', requireHousehold, requireHouseholdOwner, async (req: Request, res: Response) => {
  try {
    await householdService.removeMember(req.params.id, req.user!.id, req.params.userId);
    res.json({ message: 'Member removed successfully' });
  } catch (err) {
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/:id/members', requireHousehold, async (req: Request, res: Response) => {
  try {
    const members = await householdService.getMembers(req.params.id);
    res.json(members.map((m) => ({
      id: m.id,
      email: m.email,
      name: m.name,
      role: m.household_role,
    })));
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
