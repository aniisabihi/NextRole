import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app.js";
import { prisma } from "../../src/db/prisma.js";
import { resetDb } from "../helpers/db.js";
import { TEST_ORIGIN, bootstrapCsrf, cookieHeader } from "../helpers/http.js";
import { registerAndLogin } from "../helpers/applications.js";

function mutationHeaders(
  session: Awaited<ReturnType<typeof registerAndLogin>>,
) {
  return {
    Origin: TEST_ORIGIN,
    Cookie: session.cookieHeader,
    "X-CSRF-Token": session.cookies.csrf_token!,
  };
}

describe("applications HTTP: CRUD", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
  });

  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("creates application then gets by id", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: {
        company: "Acme",
        title: "Backend Engineer",
      },
    });

    expect(createRes.statusCode).toBe(201);
    const created = createRes.json();
    expect(created.application).toMatchObject({
      company: "Acme",
      title: "Backend Engineer",
      status: "SAVED",
      priority: "MEDIUM",
      priorityRank: 2,
      userId: session.user.id,
    });
    expect(created.application.id).toBeTruthy();

    const getRes = await app.inject({
      method: "GET",
      url: `/api/applications/${created.application.id}`,
      headers: {
        Cookie: session.cookieHeader,
      },
    });

    expect(getRes.statusCode).toBe(200);
    expect(getRes.json().application).toMatchObject({
      id: created.application.id,
      company: "Acme",
      title: "Backend Engineer",
      userId: session.user.id,
    });
  });

  it("allows create with non-default status", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: {
        company: "Beta",
        title: "SRE",
        status: "APPLIED",
      },
    });

    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().application.status).toBe("APPLIED");
  });

  it("updates application fields and returns 200 shape", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: { company: "Acme", title: "Eng" },
    });
    const id = createRes.json().application.id as string;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { notes: "Follow up", priority: "HIGH" },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().application).toMatchObject({
      id,
      notes: "Follow up",
      priority: "HIGH",
      priorityRank: 3,
    });
  });

  it("deletes application with 204 and removes row", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: { company: "Acme", title: "Eng" },
    });
    const id = createRes.json().application.id as string;

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
    });

    expect(delRes.statusCode).toBe(204);
    expect(delRes.body).toBe("");

    const getRes = await app.inject({
      method: "GET",
      url: `/api/applications/${id}`,
      headers: { Cookie: session.cookieHeader },
    });
    expect(getRes.statusCode).toBe(404);
  });

  it("returns 401 for unauthenticated requests", async () => {
    const getList = await app.inject({
      method: "GET",
      url: "/api/applications",
    });
    expect(getList.statusCode).toBe(401);

    const csrf = await bootstrapCsrf(app);
    const post = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: {
        Origin: TEST_ORIGIN,
        Cookie: cookieHeader(csrf),
        "X-CSRF-Token": csrf.csrf_token!,
      },
      payload: { company: "X", title: "Y" },
    });
    expect(post.statusCode).toBe(401);
  });

  it("returns 404 NOT_FOUND for another user's application", async () => {
    const owner = await registerAndLogin(app);
    const other = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(owner),
      payload: {
        company: "Secret Co",
        title: "Hidden Role",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().application.id as string;

    const getRes = await app.inject({
      method: "GET",
      url: `/api/applications/${id}`,
      headers: {
        Cookie: other.cookieHeader,
      },
    });

    expect(getRes.statusCode).toBe(404);
    expect(getRes.json().error.code).toBe("NOT_FOUND");

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(other),
      payload: { notes: "nope" },
    });
    expect(patchRes.statusCode).toBe(404);

    const delRes = await app.inject({
      method: "DELETE",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(other),
    });
    expect(delRes.statusCode).toBe(404);
  });

  it("returns 400 VALIDATION_ERROR for invalid body and empty PATCH", async () => {
    const session = await registerAndLogin(app);

    const badCreate = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: { company: "", title: "Eng" },
    });
    expect(badCreate.statusCode).toBe(400);
    expect(badCreate.json().error.code).toBe("VALIDATION_ERROR");

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: { company: "Acme", title: "Eng" },
    });
    const id = createRes.json().application.id as string;

    const emptyPatch = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: {},
    });
    expect(emptyPatch.statusCode).toBe(400);
    expect(emptyPatch.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("clears optional fields with JSON null and records FIELDS_UPDATED", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: {
        company: "Acme",
        title: "Eng",
        notes: "keep me",
        location: "Stockholm",
      },
    });
    expect(createRes.statusCode).toBe(201);
    const id = createRes.json().application.id as string;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { notes: null, location: null },
    });

    expect(patchRes.statusCode).toBe(200);
    expect(patchRes.json().application).toMatchObject({
      id,
      notes: null,
      location: null,
    });

    const activitiesRes = await app.inject({
      method: "GET",
      url: `/api/applications/${id}/activities`,
      headers: { Cookie: session.cookieHeader },
    });
    expect(activitiesRes.statusCode).toBe(200);
    const fieldsUpdated = (
      activitiesRes.json() as {
        items: Array<{
          type: string;
          payload: {
            fields: Record<string, { from: unknown; to: unknown }>;
          };
        }>;
      }
    ).items.find((a) => a.type === "FIELDS_UPDATED");
    expect(fieldsUpdated).toBeTruthy();
    expect(fieldsUpdated.payload.fields.notes).toEqual({
      from: "keep me",
      to: null,
    });
    expect(fieldsUpdated.payload.fields.location).toEqual({
      from: "Stockholm",
      to: null,
    });
  });

  it("stores YYYY-MM-DD as UTC midnight and rejects invalid dates with 400", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: {
        company: "Acme",
        title: "Eng",
        dateApplied: "2024-01-15",
      },
    });
    expect(createRes.statusCode).toBe(201);
    expect(createRes.json().application.dateApplied).toBe(
      "2024-01-15T00:00:00.000Z",
    );

    const id = createRes.json().application.id as string;

    const badCreate = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: {
        company: "Bad",
        title: "Date",
        dateApplied: "not-a-date",
      },
    });
    expect(badCreate.statusCode).toBe(400);
    expect(badCreate.json().error.code).toBe("VALIDATION_ERROR");

    const badCalendar = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: {
        company: "Bad",
        title: "Calendar",
        dateApplied: "2024-02-30",
      },
    });
    expect(badCalendar.statusCode).toBe(400);
    expect(badCalendar.json().error.code).toBe("VALIDATION_ERROR");

    const badPatch = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { dateDiscovered: "yesterday" },
    });
    expect(badPatch.statusCode).toBe(400);
    expect(badPatch.json().error.code).toBe("VALIDATION_ERROR");

    const goodPatch = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { dateDiscovered: "2024-02-29" },
    });
    expect(goodPatch.statusCode).toBe(200);
    expect(goodPatch.json().application.dateDiscovered).toBe(
      "2024-02-29T00:00:00.000Z",
    );
  });

  it("returns INVALID_STATUS_TRANSITION when transition denied", async () => {
    const session = await registerAndLogin(app);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/applications",
      headers: mutationHeaders(session),
      payload: { company: "Acme", title: "Eng", status: "OFFER" },
    });
    const id = createRes.json().application.id as string;

    const patchRes = await app.inject({
      method: "PATCH",
      url: `/api/applications/${id}`,
      headers: mutationHeaders(session),
      payload: { status: "APPLIED" },
    });

    expect(patchRes.statusCode).toBe(400);
    expect(patchRes.json().error.code).toBe("INVALID_STATUS_TRANSITION");
  });
});
