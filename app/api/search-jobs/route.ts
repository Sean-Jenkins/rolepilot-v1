import { NextResponse } from "next/server";

type AdzunaJob = {
  title?: string;
  description?: string;
  redirect_url?: string;
  salary_min?: number;
  salary_max?: number;
  company?: {
    display_name?: string;
  };
  location?: {
    display_name?: string;
  };
};

type RemotiveJob = {
  title?: string;
  company_name?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
  url?: string;
};

type SearchJobsRequest = {
  targetRoles?: unknown;
  keywords?: unknown;
  location?: unknown;
};

type NormalisedJob = {
  title: string;
  company: string;
  location: string;
  salary: string;
  descriptionSnippet: string;
  source: "Adzuna" | "Remotive";
  sourceUrl: string;
};

export async function POST(request: Request) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  const country = process.env.ADZUNA_COUNTRY ?? "gb";

  let body: SearchJobsRequest;

  try {
    body = (await request.json()) as SearchJobsRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const targetRoles = normaliseStringArray(body.targetRoles);
  const keywords = normaliseStringArray(body.keywords);
  const location = typeof body.location === "string" ? body.location.trim() : "";

  if (targetRoles.length === 0 && keywords.length === 0) {
    return NextResponse.json(
      { error: "Please provide target roles or job-search keywords." },
      { status: 400 },
    );
  }

  const queries = buildSearchQueries(targetRoles);

  const [adzunaResult, remotiveResult] = await Promise.all([
    appId && appKey
      ? searchAdzuna({ appId, appKey, country, queries, location })
      : Promise.resolve({
          jobs: [] as NormalisedJob[],
          successfulQuery: "",
        }),
    searchRemotive(queries),
  ]);

  const jobs = removeDuplicateJobs([
    ...adzunaResult.jobs,
    ...remotiveResult.jobs,
  ]);

  return NextResponse.json({
    jobs,
    query: adzunaResult.successfulQuery || remotiveResult.successfulQuery,
    debug:
      process.env.NODE_ENV === "development"
        ? {
            successfulQuery:
              adzunaResult.successfulQuery || remotiveResult.successfulQuery,
            adzunaQuery: adzunaResult.successfulQuery,
            remotiveQuery: remotiveResult.successfulQuery,
          }
        : undefined,
  });
}

async function searchAdzuna({
  appId,
  appKey,
  country,
  queries,
  location,
}: {
  appId: string;
  appKey: string;
  country: string;
  queries: string[];
  location: string;
}): Promise<{ jobs: NormalisedJob[]; successfulQuery: string }> {
  for (const query of queries) {
    try {
      const url = createAdzunaUrl({
        appId,
        appKey,
        country,
        query,
        location,
      });

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        next: {
          revalidate: 300,
        },
      });

      if (!response.ok) {
        logJobSearch({
          source: "Adzuna",
          country,
          query,
          resultCount: 0,
          firstTitle: "",
          status: response.status,
        });
        continue;
      }

      const data = (await response.json()) as { results?: AdzunaJob[] };
      const rawResults = data.results ?? [];
      const jobs = rawResults.flatMap((job) => {
        const normalisedJob = normaliseAdzunaJob(job);
        return normalisedJob ? [normalisedJob] : [];
      });

      logJobSearch({
        source: "Adzuna",
        country,
        query,
        resultCount: rawResults.length,
        firstTitle: rawResults[0]?.title ?? "",
      });

      if (jobs.length > 0) {
        return { jobs, successfulQuery: query };
      }
    } catch (error) {
      console.error("Adzuna job search failed", error);
    }
  }

  return { jobs: [], successfulQuery: "" };
}

async function searchRemotive(
  queries: string[],
): Promise<{ jobs: NormalisedJob[]; successfulQuery: string }> {
  for (const query of queries) {
    try {
      const url = new URL("https://remotive.com/api/remote-jobs");
      url.searchParams.set("search", query);

      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        next: {
          revalidate: 3600,
        },
      });

      if (!response.ok) {
        logJobSearch({
          source: "Remotive",
          country: "remote",
          query,
          resultCount: 0,
          firstTitle: "",
          status: response.status,
        });
        continue;
      }

      const data = (await response.json()) as { jobs?: RemotiveJob[] };
      const rawResults = data.jobs ?? [];
      const jobs = rawResults.flatMap((job) => {
        const normalisedJob = normaliseRemotiveJob(job);
        return normalisedJob ? [normalisedJob] : [];
      });

      logJobSearch({
        source: "Remotive",
        country: "remote",
        query,
        resultCount: rawResults.length,
        firstTitle: rawResults[0]?.title ?? "",
      });

      if (jobs.length > 0) {
        return { jobs, successfulQuery: query };
      }
    } catch (error) {
      console.error("Remotive job search failed", error);
    }
  }

  return { jobs: [], successfulQuery: "" };
}

function buildSearchQueries(targetRoles: string[]) {
  const fallbackQueries = [
    "project coordinator",
    "operations coordinator",
    "implementation specialist",
    "business operations",
  ];

  return Array.from(
    new Set(
      [targetRoles[0], targetRoles[1], ...fallbackQueries]
        .filter((query): query is string => Boolean(query))
        .map((query) => query.trim())
        .filter(Boolean),
    ),
  );
}

function createAdzunaUrl({
  appId,
  appKey,
  country,
  query,
  location,
}: {
  appId: string;
  appKey: string;
  country: string;
  query: string;
  location: string;
}) {
  const url = new URL(
    `https://api.adzuna.com/v1/api/jobs/${country}/search/1`,
  );
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", "6");
  url.searchParams.set("what", query);
  url.searchParams.set("content-type", "application/json");

  if (location) {
    url.searchParams.set("where", location);
  }

  return url;
}

function logJobSearch({
  source,
  country,
  query,
  resultCount,
  firstTitle,
  status,
}: {
  source: string;
  country: string;
  query: string;
  resultCount: number;
  firstTitle: string;
  status?: number;
}) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.info(
    `${source} search`,
    JSON.stringify(
      {
        country,
        query,
        resultCount,
        firstTitle: firstTitle || null,
        status,
      },
      null,
      2,
    ),
  );
}

function normaliseStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normaliseAdzunaJob(job: AdzunaJob) {
  if (!job.title || !job.redirect_url) {
    return null;
  }

  return {
    title: job.title,
    company: job.company?.display_name ?? "Company not listed",
    location: job.location?.display_name ?? "Location not listed",
    salary: formatSalary(job.salary_min, job.salary_max),
    descriptionSnippet: createSnippet(job.description ?? ""),
    source: "Adzuna" as const,
    sourceUrl: job.redirect_url,
  };
}

function normaliseRemotiveJob(job: RemotiveJob) {
  if (!job.title || !job.url) {
    return null;
  }

  return {
    title: job.title,
    company: job.company_name ?? "Company not listed",
    location: job.candidate_required_location ?? "Remote",
    salary: job.salary ?? "",
    descriptionSnippet: createSnippet(job.description ?? ""),
    source: "Remotive" as const,
    sourceUrl: job.url,
  };
}

function removeDuplicateJobs(jobs: NormalisedJob[]) {
  const seen = new Set<string>();

  return jobs.filter((job) => {
    const key = `${job.title}-${job.company}`.toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatSalary(min?: number, max?: number) {
  if (!min && !max) {
    return "";
  }

  const formatter = new Intl.NumberFormat("en", {
    maximumFractionDigits: 0,
  });

  if (min && max) {
    return `${formatter.format(min)} - ${formatter.format(max)}`;
  }

  return formatter.format(min ?? max ?? 0);
}

function createSnippet(description: string) {
  return description.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}
