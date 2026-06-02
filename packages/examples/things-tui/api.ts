// examples/things-tui/api.ts
import type {
  LoginResponse, ThingSummary, Thing, Section, SectionThing, ThingOfTheDay,
  ThingsOfTheDayCalendar,
} from './types.js';

// THINGS_TUI_BASE overrides; defaults to prod. Local DDEV: https://api.poetry.ddev.site
export const BASE = process.env.THINGS_TUI_BASE ?? 'https://api.poetry.mellonis.ru';

let token: string | null = null;

export function setToken(t: string | null): void { token = t; }
export function getToken(): string | null { return token; }

export class ApiError extends Error {
  constructor(public status: number, public body: unknown, message: string) {
    super(message);
  }
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let body: unknown = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body, `${init.method ?? 'GET'} ${path} → ${res.status}`);
  }
  return body as T;
}

// API uses `login` field (not `email`) for the user identifier — verified via curl.
// 200 response shape assumed: { accessToken, refreshToken?, user? } — adjust if needed.
export async function login(loginField: string, password: string, signal?: AbortSignal): Promise<LoginResponse> {
  return req<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: loginField, password }),
    signal,
  });
}

export async function listThings(signal?: AbortSignal): Promise<ThingSummary[]> {
  return req<ThingSummary[]>('/cms/things', { signal });
}

export async function getThing(id: number, signal?: AbortSignal): Promise<Thing> {
  return req<Thing>(`/cms/things/${id}`, { signal });
}

export async function listSections(signal?: AbortSignal): Promise<Section[]> {
  return req<Section[]>('/cms/sections', { signal });
}

export async function getSectionThings(sectionId: number, signal?: AbortSignal): Promise<SectionThing[]> {
  return req<SectionThing[]>(`/cms/sections/${sectionId}/things`, { signal });
}

export async function listThingsOfTheDay(signal?: AbortSignal): Promise<ThingOfTheDay[]> {
  return req<ThingOfTheDay[]>('/things-of-the-day', { signal });
}

export async function listThingsOfTheDayCalendar(signal?: AbortSignal): Promise<ThingsOfTheDayCalendar> {
  return req<ThingsOfTheDayCalendar>('/cms/things-of-the-day/calendar', { signal });
}
