// Auth: local users, scrypt-hashed passwords, roles.
import bcrypt from 'bcryptjs';
import { getPrisma, audit } from '../db';

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  role: 'ADMIN' | 'WORKING_PARTNER';
}

export async function userCount(): Promise<number> {
  const db = getPrisma();
  return db.user.count();
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { username: username.trim() } });
  if (!user || !user.isActive) throw new Error('Invalid username or password');
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) throw new Error('Invalid username or password');
  return { id: user.id, name: user.name, username: user.username, role: user.role as SessionUser['role'] };
}

export async function createUser(
  input: { name: string; username: string; password: string; role: 'ADMIN' | 'WORKING_PARTNER' },
  actorId: string | null,
) {
  if (input.password.length < 6) throw new Error('Password must be at least 6 characters');
  const db = getPrisma();
  const existing = await db.user.findUnique({ where: { username: input.username.trim() } });
  if (existing) throw new Error('Username already exists');
  const hash = await bcrypt.hash(input.password, 10);
  const u = await db.user.create({
    data: { name: input.name.trim(), username: input.username.trim(), passwordHash: hash, role: input.role },
  });
  await audit(actorId, 'USER_CREATED', 'User', u.id, { username: input.username, role: input.role });
  return { id: u.id, name: u.name, username: u.username, role: u.role };
}

export async function listUsers() {
  const db = getPrisma();
  return db.user.findMany({
    select: { id: true, name: true, username: true, role: true, isActive: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function changePassword(userId: string, oldPassword: string, newPassword: string) {
  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters');
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');
  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');
  const hash = await bcrypt.hash(newPassword, 10);
  await db.user.update({ where: { id: userId }, data: { passwordHash: hash } });
  await audit(userId, 'PASSWORD_CHANGED', 'User', userId, {});
  return { ok: true };
}
