import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import type { User, UserRole } from "@knowledge-amazon/shared";
import { loadConfig } from "./config.js";
import { queryOne } from "./db.js";

interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: User;
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function signToken(user: User): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role
    } satisfies JwtPayload,
    loadConfig().jwtSecret,
    { expiresIn: "12h" }
  );
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    await reply.code(401).send({ error: "Missing authorization token" });
    return;
  }

  try {
    const decoded = jwt.verify(token, loadConfig().jwtSecret) as JwtPayload;
    const user = await queryOne<User>(
      "SELECT id, name, email, role FROM users WHERE id = $1 AND status = 'active'",
      [decoded.sub]
    );

    if (!user) {
      await reply.code(401).send({ error: "Invalid authorization token" });
      return;
    }

    (request as AuthenticatedRequest).user = user;
  } catch {
    await reply.code(401).send({ error: "Invalid authorization token" });
  }
}

export function requireRole(user: User, allowed: UserRole[]): void {
  if (!allowed.includes(user.role)) {
    throw new Error("Forbidden");
  }
}
