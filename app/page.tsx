"use client";

import {
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SAVED_JOBS_STORAGE_KEY = "job-match-agent:saved-jobs";
const APPLICATION_STATUSES = [
  "Saved",
  "Applied",
  "Interviewing",
  "Offer",
  "Rejected",
  "Withdrawn",
  "No Response",
] as const;

type WorkMode = "Remote" | "Hybrid" | "On-site" | "Location unclear";

export default function Home() {
  const [cvText, setCvText] = useState("");
  const [hasAnalysed, setHasAnalysed] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [revealStage, setRevealStage] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<AnalysisData | null>(
    null,
  );
  const [analysisError, setAnalysisError] = useState("");
  const [jobListings, setJobListings] = useState<JobListing[]>([]);
  const [isSearchingJobs, setIsSearchingJobs] = useState(false);
  const [jobSearchMessage, setJobSearchMessage] = useState("");
  const [jobSearchQuery, setJobSearchQuery] = useState("");
  const [jobSearchLocation, setJobSearchLocation] = useState("");
  const [jobSourceFilter, setJobSourceFilter] = useState<JobSourceFilter>("All");
  const [savedJobs, setSavedJobs] = useState<SavedJob[]>([]);
  const [hasLoadedSavedJobs, setHasLoadedSavedJobs] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [hasUploadedFile, setHasUploadedFile] = useState(false);
  const [isExtractingFile, setIsExtractingFile] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isManualOpen, setIsManualOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAnalyse =
    cvText.trim().length > 0 && !isAnalysing && !isExtractingFile;

  const characterCount = useMemo(() => cvText.trim().length, [cvText]);
  const savedJobIds = useMemo(() => savedJobs.map(getJobId), [savedJobs]);

  useEffect(() => {
    const savedJobsJson = window.localStorage.getItem(SAVED_JOBS_STORAGE_KEY);

    if (!savedJobsJson) {
      setHasLoadedSavedJobs(true);
      return;
    }

    try {
      const parsedSavedJobs = JSON.parse(savedJobsJson);

      if (isJobListingArray(parsedSavedJobs)) {
        setSavedJobs(normaliseSavedJobs(parsedSavedJobs));
      }
    } catch {
      window.localStorage.removeItem(SAVED_JOBS_STORAGE_KEY);
    } finally {
      setHasLoadedSavedJobs(true);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedSavedJobs) {
      return;
    }

    window.localStorage.setItem(
      SAVED_JOBS_STORAGE_KEY,
      JSON.stringify(savedJobs),
    );
  }, [hasLoadedSavedJobs, savedJobs]);

  async function handleAnalyse() {
    if (!canAnalyse) {
      return;
    }

    setIsAnalysing(true);
    setHasAnalysed(false);
    setAnalysisError("");
    setJobListings([]);
    setJobSearchMessage("");
    setJobSearchQuery("");
    setJobSourceFilter("All");
    setRevealStage(0);
    setLoadingStep(0);

    try {
      const analysisPromise = requestCvAnalysis(cvText);

      await wait(650);
      setLoadingStep(1);
      await wait(700);
      setLoadingStep(2);
      await wait(700);
      setLoadingStep(3);

      const analysis = await analysisPromise;

      setAnalysisResult(analysis);
      setHasAnalysed(true);
      setIsAnalysing(false);
      searchJobsForAnalysis(analysis);

      for (const stage of [1, 2, 3, 4, 5]) {
        setRevealStage(stage);
        await wait(220);
      }
    } catch (error) {
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "CV analysis failed. Please try again.",
      );
      setIsAnalysing(false);
    }
  }

  function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    handleSelectedFile(file);
  }

  async function handleSelectedFile(file?: File) {
    if (!file) {
      return;
    }

    const fileName = file.name;
    const extension = fileName.split(".").pop()?.toLowerCase();

    setUploadedFileName(fileName);
    setHasUploadedFile(false);
    setHasAnalysed(false);
    setAnalysisError("");
    setJobListings([]);
    setJobSearchMessage("");
    setJobSearchQuery("");
    setRevealStage(0);
    setUploadMessage("Extracting CV text...");

    if (extension === "txt") {
      const reader = new FileReader();

      reader.onload = () => {
        const extractedText = String(reader.result ?? "").trim();
        setCvText(extractedText);
        setHasUploadedFile(extractedText.length > 0);
        setUploadMessage(
          extractedText
            ? "CV text extracted successfully."
            : "No readable text was found in this text file.",
        );
      };

      reader.onerror = () => {
        setUploadMessage("We could not read this text file. Please try again.");
      };

      reader.readAsText(file);
      return;
    }

    if (extension === "docx" || extension === "pdf") {
      setIsExtractingFile(true);

      try {
        const extractedText = await extractUploadedFileText(file);
        setCvText(extractedText);
        setHasUploadedFile(extractedText.length > 0);
        setUploadMessage("CV text extracted successfully.");
      } catch (error) {
        setCvText("");
        setUploadMessage(
          error instanceof Error
            ? error.message
            : "We could not extract text from this file.",
        );
      } finally {
        setIsExtractingFile(false);
      }
      return;
    }

    if (extension === "doc") {
      setUploadMessage("DOC parsing will be added in the next iteration.");
      setCvText("");
      return;
    }

    setCvText("");
    setUploadMessage("Please upload a .txt, .doc, .docx, or .pdf file.");
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);

    if (isAnalysing) {
      return;
    }

    handleSelectedFile(event.dataTransfer.files[0]);
  }

  async function searchJobsForAnalysis(analysis: AnalysisData) {
    setIsSearchingJobs(true);
    setJobListings([]);
    setJobSearchMessage("");
    setJobSearchQuery("");

    try {
      const result = await requestJobSearch({
        targetRoles: analysis.targetRoles,
        keywords: analysis.keywords ?? [],
        location: jobSearchLocation,
      });

      if (result.jobs.length === 0) {
        setJobSearchMessage(
          "No live jobs found for this search. Showing AI-generated suggestions instead.",
        );
        return;
      }

      setJobListings(result.jobs);
      setJobSearchQuery(result.successfulQuery);
    } catch {
      setJobSearchMessage(
        "Live job search is unavailable right now. Showing AI-generated suggestions instead.",
      );
    } finally {
      setIsSearchingJobs(false);
    }
  }

  function handleRefreshJobs() {
    if (!analysisResult || isSearchingJobs) {
      return;
    }

    setJobSourceFilter("All");
    searchJobsForAnalysis(analysisResult);
  }

  function handleSaveJob(job: JobListing) {
    setSavedJobs((currentSavedJobs) => {
      const isAlreadySaved = currentSavedJobs.some(
        (savedJob) => getJobId(savedJob) === getJobId(job),
      );

      if (isAlreadySaved) {
        return currentSavedJobs;
      }

      return [{ ...job, status: "Saved" }, ...currentSavedJobs];
    });
  }

  function handleRemoveSavedJob(jobId: string) {
    setSavedJobs((currentSavedJobs) =>
      currentSavedJobs.filter((job) => getJobId(job) !== jobId),
    );
  }

  function handleUpdateSavedJobStatus(
    jobId: string,
    status: ApplicationStatus,
  ) {
    setSavedJobs((currentSavedJobs) =>
      currentSavedJobs.map((job) =>
        getJobId(job) === jobId ? { ...job, status } : job,
      ),
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f4fb] text-ink">
      <header className="border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-[1840px] items-center justify-between px-4 py-4 sm:px-5 lg:px-6 xl:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple text-sm font-semibold text-white shadow-[0_10px_24px_rgba(109,40,217,0.24)]">
              R
            </div>
            <div>
              <p className="text-sm font-semibold leading-none">RolePilot</p>
            </div>
          </div>

          <nav
            aria-label="Main navigation"
            className="hidden items-center gap-7 text-base font-semibold text-[#5f5875] sm:flex"
          >
            <a
              href="#cv-input"
              className="rounded-full px-2 py-1 transition hover:bg-purple/5 hover:text-purple"
            >
              Upload CV
            </a>
            <a
              href="#results"
              className="rounded-full px-2 py-1 transition hover:bg-purple/5 hover:text-purple"
            >
              Analyse
            </a>
            <a
              href="#jobs"
              className="rounded-full px-2 py-1 transition hover:bg-purple/5 hover:text-purple"
            >
              Recommended Jobs
            </a>
            <a
              href="#saved-jobs"
              className="rounded-full px-2 py-1 transition hover:bg-purple/5 hover:text-purple"
            >
              Saved Jobs
            </a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1840px] px-4 py-6 sm:px-5 sm:py-7 lg:px-6 xl:px-6">
        <section className="mb-5">
          <div className="max-w-5xl space-y-3">
            <div className="inline-flex rounded-full border border-purple/20 bg-purple/5 px-3 py-1 text-xs font-semibold text-purple shadow-sm">
              RolePilot workspace
            </div>
            <h1 className="text-5xl font-semibold leading-tight tracking-tight text-purple sm:text-6xl">
              Discover Roles That Match Your Experience
            </h1>
            <p className="max-w-4xl text-lg leading-8 text-[#5f5875]">
              RolePilot analyses your background, identifies your strongest
              role matches, and searches live job platforms to surface relevant
              opportunities in real time.
            </p>
          </div>
        </section>

        <ProcessSection />

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:gap-6 2xl:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] 2xl:items-start">
          <div
            id="cv-input"
            className="scroll-mt-24 rounded-3xl border border-purple/15 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6 lg:min-h-[700px] lg:p-7"
          >
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-purple">
                  Upload CV
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#5f5875]">
                  Start by uploading your CV. DOCX works best right now, with
                  manual paste available as a fallback.
                </p>
              </div>
              <span className="w-fit rounded-full bg-purple/10 px-3 py-1 text-xs font-medium text-purple">
                No account needed
              </span>
            </div>

            <label
              htmlFor="cv-upload"
              onDragOver={(event) => {
                event.preventDefault();
                if (!isAnalysing) {
                  setIsDragging(true);
                }
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`group flex min-h-[285px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed p-6 text-center transition duration-200 lg:min-h-[330px] ${
                hasUploadedFile
                  ? "border-purple bg-purple/10 shadow-[0_18px_44px_rgba(109,40,217,0.16)]"
                : isDragging
                  ? "border-purple bg-purple/15 shadow-[0_18px_44px_rgba(109,40,217,0.18)]"
                  : "border-slate-300 bg-slate-50/80 hover:border-purple hover:bg-purple/5 hover:shadow-[0_18px_44px_rgba(109,40,217,0.12)]"
              } ${
                isAnalysing || isExtractingFile
                  ? "upload-working cursor-not-allowed"
                  : ""
              }`}
            >
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-purple text-white shadow-[0_16px_34px_rgba(109,40,217,0.32)] transition group-hover:-translate-y-0.5 group-hover:bg-purple-dark">
                <svg
                  aria-hidden="true"
                  className="h-10 w-10"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M12 16V5m0 0 4 4m-4-4-4 4M5 16.5V18a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-1.5"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </div>

              <div className="mt-5 max-w-md">
                <p className="text-sm font-semibold uppercase text-purple">
                  Upload your CV
                </p>
                <p className="mt-2 text-xl font-semibold text-slate-950">
                  {hasUploadedFile
                    ? "CV uploaded successfully"
                    : isExtractingFile
                    ? "Extracting text from your CV"
                    : "Drop your CV here"}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5f5875]">
                  Drag and drop a .txt, .doc, .docx, or .pdf file, or click to
                  choose one from your computer.
                </p>
              </div>

              <span className="mt-5 inline-flex h-11 items-center justify-center rounded-xl bg-purple px-5 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(109,40,217,0.24)] transition group-hover:-translate-y-0.5 group-hover:bg-purple-dark">
                Choose CV file
              </span>

              {(uploadedFileName || uploadMessage) && (
                <div className="mt-5 w-full max-w-md rounded-xl border border-purple/20 bg-white p-4 text-left shadow-sm">
                  {uploadedFileName && (
                    <p className="text-sm font-semibold text-slate-950">
                      {uploadedFileName}
                    </p>
                  )}
                  {uploadMessage && (
                    <p className="mt-1 text-sm leading-6 text-[#5f5875]">
                      {uploadMessage}
                    </p>
                  )}
                  {hasUploadedFile && (
                    <p className="mt-2 text-sm font-medium text-purple">
                      {characterCount} extracted characters ready for analysis
                    </p>
                  )}
                </div>
              )}

              <input
                ref={fileInputRef}
                id="cv-upload"
                type="file"
                accept=".txt,.doc,.docx,.pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
                onChange={handleFileUpload}
                disabled={isAnalysing}
                className="sr-only"
              />
            </label>

            <div className="mt-6 flex flex-col gap-4 rounded-3xl border border-purple/25 bg-purple/5 p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-medium text-slate-700">
                {isAnalysing
                  ? "Analysing your CV..."
                  : isExtractingFile
                  ? "Extracting text from uploaded CV..."
                  : hasUploadedFile
                  ? `${characterCount} extracted characters ready to analyse`
                  : `${characterCount} characters ready to analyse`}
              </p>
              <button
                type="button"
                onClick={handleAnalyse}
                disabled={!canAnalyse}
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-purple px-8 text-base font-semibold text-white shadow-[0_18px_38px_rgba(109,40,217,0.34)] transition duration-200 hover:-translate-y-0.5 hover:bg-purple-dark hover:shadow-[0_22px_44px_rgba(109,40,217,0.4)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none sm:min-w-48"
              >
                {isAnalysing && (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                )}
                {isAnalysing ? "Analysing..." : "Analyse CV"}
              </button>
            </div>

            {analysisError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
                {analysisError}
              </div>
            )}

            <div className="mt-6 rounded-3xl border border-slate-300 bg-white">
              <button
                type="button"
                onClick={() => setIsManualOpen((isOpen) => !isOpen)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-950">
                    Paste CV manually instead
                  </p>
                  <p className="mt-1 text-sm text-[#6d6384]">
                    Use this if you do not have a file ready.
                  </p>
                </div>
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-purple/10 text-purple transition ${
                    isManualOpen ? "rotate-180" : ""
                  }`}
                >
                  <svg
                    aria-hidden="true"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <path
                      d="m6 9 6 6 6-6"
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                    />
                  </svg>
                </span>
              </button>

              {isManualOpen && (
                <div className="border-t border-slate-200 p-5">
                  <label
                    htmlFor="cv"
                    className="mb-3 block text-sm font-semibold text-slate-800"
                  >
                    CV text
                  </label>
                  <textarea
                    id="cv"
                    value={cvText}
                    disabled={isAnalysing}
                    onChange={(event) => {
                      setCvText(event.target.value);
                      setHasAnalysed(false);
                      setJobListings([]);
                      setJobSearchMessage("");
                      setJobSearchQuery("");
                      setJobSourceFilter("All");
                      setRevealStage(0);
                    }}
                    placeholder="Paste your CV here..."
                    className="min-h-64 w-full resize-y rounded-xl border border-slate-300 bg-white p-4 text-sm leading-6 text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-purple focus:ring-4 focus:ring-purple/15 disabled:cursor-not-allowed disabled:bg-slate-50"
                  />
                </div>
              )}
            </div>
          </div>

          <aside
            id="results"
            className="scroll-mt-24 rounded-3xl border border-purple/15 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6 lg:p-7"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-purple">
                  Your Job Match Analysis
                </h2>
                <p className="mt-1 text-sm leading-6 text-[#5f5875]">
                  {isAnalysing
                    ? "Scanning the CV text and preparing job matches."
                    : hasAnalysed
                    ? "AI-generated role fit, skills, keywords, and search terms."
                    : "Your analysis will appear here after RolePilot reads your CV."}
                </p>
              </div>
              <span className="rounded-full bg-purple/10 px-3 py-1 text-xs font-semibold text-purple">
                V1
              </span>
            </div>

            <div className="lg:pr-2">
              {isAnalysing ? (
                <AnalysingState step={loadingStep} />
              ) : hasAnalysed ? (
                analysisResult && (
                  <AnalysisCards
                    analysis={analysisResult}
                    muted={false}
                    revealStage={revealStage}
                  />
                )
              ) : (
                <EmptyAnalysisState />
              )}
            </div>
          </aside>
        </section>

        <section id="jobs" className="mt-5 scroll-mt-24 space-y-5">
          <LiveJobsSection
            analysis={analysisResult}
            jobs={jobListings}
            isSearchingJobs={isSearchingJobs}
            jobSearchMessage={jobSearchMessage}
            jobSearchQuery={jobSearchQuery}
            jobSearchLocation={jobSearchLocation}
            jobSourceFilter={jobSourceFilter}
            savedJobIds={savedJobIds}
            hasAnalysed={hasAnalysed}
            onSaveJob={handleSaveJob}
            onJobSearchLocationChange={setJobSearchLocation}
            onJobSourceFilterChange={setJobSourceFilter}
            onRefreshJobs={handleRefreshJobs}
          />

          <SavedJobsSection
            savedJobs={savedJobs}
            onRemoveSavedJob={handleRemoveSavedJob}
            onUpdateSavedJobStatus={handleUpdateSavedJobStatus}
          />
        </section>

        <footer className="mt-6 flex flex-col gap-3 border-t border-purple/10 py-6 text-sm text-[#6d6384] sm:flex-row sm:items-center sm:justify-between">
          <p>RolePilot — AI-powered job matching and application tracking.</p>
          <nav
            aria-label="Footer navigation"
            className="flex flex-wrap gap-4 font-semibold text-[#5f5875]"
          >
            <a href="#" className="transition hover:text-purple">
              About
            </a>
            <a href="#" className="transition hover:text-purple">
              Privacy
            </a>
            <a href="#" className="transition hover:text-purple">
              Contact
            </a>
          </nav>
        </footer>
      </div>
    </main>
  );
}

type AnalysisData = {
  targetRoles: string[];
  skills: string[];
  industries: string[];
  matchScore: number;
  profileSummary: string;
  sampleJobs: {
    title: string;
    company: string;
    location: string;
  }[];
  seniority?: string;
  keywords?: string[];
};

type JobListing = {
  title: string;
  company: string;
  location: string;
  salary: string;
  descriptionSnippet: string;
  source: "Adzuna" | "Remotive";
  sourceUrl: string;
};

type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

type SavedJob = JobListing & {
  status: ApplicationStatus;
};

type JobSourceFilter = "All" | "Adzuna" | "Remotive";

function getJobId(job: JobListing) {
  return job.sourceUrl || `${job.source}-${job.title}-${job.company}`;
}

function removeDuplicateJobs(jobs: JobListing[]) {
  const seenJobIds = new Set<string>();

  return jobs.filter((job) => {
    const jobId = getJobId(job);

    if (seenJobIds.has(jobId)) {
      return false;
    }

    seenJobIds.add(jobId);
    return true;
  });
}

function normaliseSavedJobs(jobs: JobListing[]) {
  return removeDuplicateJobs(jobs).map((job) => ({
    ...job,
    status: normaliseApplicationStatus((job as Partial<SavedJob>).status),
  }));
}

function isApplicationStatus(value: unknown): value is ApplicationStatus {
  return APPLICATION_STATUSES.includes(value as ApplicationStatus);
}

function normaliseApplicationStatus(value: unknown): ApplicationStatus {
  if (isApplicationStatus(value)) {
    return value;
  }

  if (value === "Applied") {
    return "Applied";
  }

  if (value === "Interview") {
    return "Interviewing";
  }

  if (value === "Interested") {
    return "Saved";
  }

  if (value === "Rejected") {
    return "Rejected";
  }

  if (value === "Withdrawn") {
    return "Withdrawn";
  }

  if (value === "No Response") {
    return "No Response";
  }

  return "Saved";
}

function inferWorkMode(job: JobListing): WorkMode {
  const combinedText = [
    job.title,
    job.location,
    job.descriptionSnippet,
    job.source,
  ]
    .join(" ")
    .toLowerCase();

  if (combinedText.includes("hybrid")) {
    return "Hybrid";
  }

  if (
    job.source === "Remotive" ||
    combinedText.includes("remote") ||
    combinedText.includes("work from home") ||
    combinedText.includes("anywhere") ||
    combinedText.includes("worldwide")
  ) {
    return "Remote";
  }

  if (
    combinedText.includes("on-site") ||
    combinedText.includes("onsite") ||
    combinedText.includes("office based") ||
    combinedText.includes("office-based")
  ) {
    return "On-site";
  }

  if (!job.location || job.location.toLowerCase().includes("not specified")) {
    return "Location unclear";
  }

  return "On-site";
}

function isAnalysisData(value: unknown): value is AnalysisData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const analysis = value as Partial<AnalysisData>;

  return (
    Array.isArray(analysis.targetRoles) &&
    Array.isArray(analysis.skills) &&
    Array.isArray(analysis.industries) &&
    Array.isArray(analysis.keywords) &&
    Array.isArray(analysis.sampleJobs) &&
    typeof analysis.seniority === "string" &&
    typeof analysis.profileSummary === "string" &&
    typeof analysis.matchScore === "number"
  );
}

function isJobListingArray(value: unknown): value is JobListing[] {
  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((job) => {
    if (!job || typeof job !== "object") {
      return false;
    }

    const listing = job as Partial<JobListing>;

    return (
      typeof listing.title === "string" &&
      typeof listing.company === "string" &&
      typeof listing.location === "string" &&
      (listing.source === "Adzuna" || listing.source === "Remotive") &&
      typeof listing.sourceUrl === "string"
    );
  });
}

async function requestCvAnalysis(cvText: string): Promise<AnalysisData> {
  const response = await fetch("/api/analyse-cv", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cvText }),
  });

  const result = (await response.json()) as {
    analysis?: unknown;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error ?? "CV analysis failed. Please try again.");
  }

  if (!isAnalysisData(result.analysis)) {
    throw new Error("The AI returned an invalid response. Please try again.");
  }

  return result.analysis;
}

async function requestJobSearch({
  targetRoles,
  keywords,
  location,
}: {
  targetRoles: string[];
  keywords: string[];
  location: string;
}) {
  const response = await fetch("/api/search-jobs", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ targetRoles, keywords, location }),
  });

  const result = (await response.json()) as {
    jobs?: unknown;
    debug?: {
      successfulQuery?: unknown;
    };
    error?: string;
  };

  if (!response.ok) {
    throw new Error(result.error ?? "Job search failed.");
  }

  if (!isJobListingArray(result.jobs)) {
    throw new Error("Job search returned an invalid response.");
  }

  return {
    jobs: result.jobs,
    successfulQuery:
      typeof result.debug?.successfulQuery === "string"
        ? result.debug.successfulQuery
        : "",
  };
}

async function extractUploadedFileText(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const fallbackMessage = getExtractionFailureMessage(file);

  const response = await fetch("/api/extract-cv", {
    method: "POST",
    body: formData,
  });
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    console.error("CV extraction returned a non-JSON response.", {
      status: response.status,
      contentType,
    });

    throw new Error(fallbackMessage);
  }

  let result: {
    text?: string;
    error?: string;
  };

  try {
    result = (await response.json()) as {
      text?: string;
      error?: string;
    };
  } catch (error) {
    console.error("CV extraction response could not be parsed as JSON.", error);
    throw new Error(fallbackMessage);
  }

  if (!response.ok || !result.text) {
    throw new Error(result.error ?? fallbackMessage);
  }

  return result.text.trim();
}

function getExtractionFailureMessage(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension === "pdf") {
    return "We could not extract text from this PDF. Please try another PDF or paste your CV manually.";
  }

  return "We could not extract text from this DOCX. Please try another file or paste your CV manually.";
}

function wait(milliseconds: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

/*
Development-only manual QA notes:
- No CV uploaded: confirm Analyse CV stays disabled with an empty upload/paste area.
- Unsupported file: upload a .png or .rtf file and confirm the unsupported-file message appears.
- OpenAI error: temporarily remove/alter OPENAI_API_KEY in .env.local, restart dev, and run analysis.
- No job results: use a very niche CV/search profile or temporarily return an empty jobs array while developing.
- Failed job source: temporarily use invalid Adzuna credentials or disconnect network in dev, then confirm fallback messaging.
*/

function ProcessSection() {
  const steps = [
    {
      label: "Step 1",
      title: "Upload CV",
      description: "Add your CV or paste the text manually.",
    },
    {
      label: "Step 2",
      title: "Analyse Profile",
      description: "RolePilot reads your experience and role signals.",
    },
    {
      label: "Step 3",
      title: "Discover Jobs",
      description: "Live opportunities are matched to your profile.",
    },
    {
      label: "Step 4",
      title: "Save Jobs",
      description: "Track applications and interview progress in your pipeline.",
    },
  ];

  return (
    <section className="mb-5 rounded-3xl border border-purple/15 bg-white/90 p-5 shadow-[0_14px_35px_rgba(15,23,42,0.07)] sm:p-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-purple">
            How RolePilot Works
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-[#5f5875]">
            Upload your CV and let RolePilot analyse your experience, match
            roles, and surface live opportunities.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] lg:items-stretch">
        {steps.map((step, index) => (
          <FragmentWithConnector
            key={step.title}
            showConnector={index < steps.length - 1}
          >
            <ProcessStep {...step} />
          </FragmentWithConnector>
        ))}
      </div>
    </section>
  );
}

function FragmentWithConnector({
  children,
  showConnector,
}: {
  children: ReactNode;
  showConnector: boolean;
}) {
  return (
    <>
      {children}
      {showConnector && (
        <div className="hidden items-center justify-center px-1 text-purple/60 lg:flex">
          <span className="text-xl">→</span>
        </div>
      )}
    </>
  );
}

function ProcessStep({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-purple/10 bg-[#f7f4fb] p-4">
      <p className="text-xs font-semibold uppercase text-purple">{label}</p>
      <h3 className="mt-2 text-base font-semibold text-slate-950">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-[#5f5875]">{description}</p>
    </div>
  );
}

function AnalysingState({ step }: { step: number }) {
  const loadingSteps = [
    "Reading CV structure",
    "Extracting skills and seniority",
    "Finding role patterns",
    "Preparing matching jobs",
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-purple/30 bg-purple/5 p-5 shadow-[0_14px_34px_rgba(109,40,217,0.12)]">
        <div className="flex items-center gap-3">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-purple/30 border-t-purple" />
          <div>
            <p className="text-sm font-semibold text-slate-900">
              AI analysing CV
            </p>
            <p className="mt-1 text-sm text-[#5f5875]">
              {loadingSteps[step]}
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {loadingSteps.map((label, index) => (
            <div
              key={label}
              className={`h-1.5 rounded-full transition ${
                index <= step ? "bg-purple" : "bg-purple/15"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LoadingCard lines={2} />
        <LoadingCard lines={3} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <LoadingCard lines={4} />
        <LoadingCard lines={3} />
      </div>

      <LoadingCard lines={3} />
    </div>
  );
}

function EmptyAnalysisState() {
  return (
    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50/80 p-8 text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="relative h-14 w-14">
          <div className="absolute inset-x-3 top-1 h-12 rounded-full border-2 border-purple/30" />
          <div className="absolute left-2 top-5 h-8 w-10 rounded-xl border border-slate-300 bg-slate-50" />
          <div className="absolute right-1 top-3 h-5 w-5 rounded-full bg-purple shadow-[0_0_0_6px_rgba(109,40,217,0.12)]" />
          <div className="absolute bottom-1 left-5 h-1.5 w-8 rounded-full bg-slate-300" />
        </div>
      </div>

      <h3 className="mt-5 text-base font-semibold text-slate-950">
        RolePilot is ready when your CV is.
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5f5875]">
        Your analysis will appear here after RolePilot reads your CV.
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {["Roles", "Skills", "Jobs"].map((label) => (
          <div
            key={label}
            className="rounded-xl border border-purple/10 bg-white px-3 py-3 text-left shadow-sm"
          >
            <div className="h-2 w-10 rounded-full bg-purple/30" />
            <p className="mt-3 text-xs font-semibold text-[#4d4768]">
              {label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingCard({ lines }: { lines: number }) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
      <div className="h-4 w-28 animate-pulse rounded-full bg-slate-200" />
      <div className="mt-5 space-y-3">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="h-8 animate-pulse rounded-full bg-slate-100"
            style={{ width: `${88 - index * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}

function AnalysisCards({
  analysis,
  muted,
  revealStage = 5,
}: {
  analysis: AnalysisData;
  muted: boolean;
  revealStage?: number;
}) {
  return (
    <div
      className={`space-y-4 transition-all duration-500 ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
        {revealStage >= 1 && (
          <div className="result-pop rounded-2xl border border-slate-300 bg-slate-50 p-4 shadow-[0_14px_34px_rgba(15,23,42,0.08)] transition hover:-translate-y-0.5 hover:border-purple/40 hover:shadow-[0_18px_40px_rgba(109,40,217,0.12)]">
            <ResultHeader
              title="Match Score"
              description="Overall fit for likely target roles"
            />
            <div className="mt-3 flex items-end gap-2">
              <span className="text-3xl font-semibold tracking-tight text-slate-950">
                {analysis.matchScore}
              </span>
              <span className="pb-1 text-sm font-medium text-slate-700">
                /100
              </span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-slate-200">
              <div
                className="h-2 rounded-full bg-purple transition-all duration-700 ease-out"
                style={{ width: `${analysis.matchScore}%` }}
              />
            </div>
          </div>
        )}

        {revealStage >= 2 && (
          <AnalysisSection
            title="Target Roles"
            description="Roles the profile appears best aligned with"
            items={analysis.targetRoles}
          />
        )}
      </div>

      {revealStage >= 1 && (
        <div className="result-pop rounded-2xl border border-purple/20 bg-purple/5 p-4 shadow-[0_12px_30px_rgba(109,40,217,0.08)]">
          <ResultHeader
            title="Profile Summary"
            description="Short readout based on the CV text"
          />
          <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-800">
            {analysis.profileSummary}
          </p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {revealStage >= 3 && (
          <AnalysisSection
            title="Skills"
            description="Reusable strengths to highlight"
            items={analysis.skills}
          />
        )}
        {revealStage >= 4 && (
          <AnalysisSection
            title="Industries"
            description="Markets where this profile may fit"
            items={analysis.industries}
          />
        )}
      </div>

      {revealStage >= 4 && analysis.seniority && (
        <div
          className="result-pop rounded-2xl border border-slate-300 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-purple/40 hover:shadow-[0_18px_40px_rgba(109,40,217,0.1)]"
        >
          <ResultHeader
            title="Seniority"
            description="Likely level based on the evidence"
          />
          <p className="mt-2 text-sm text-slate-700">{analysis.seniority}</p>
        </div>
      )}

      {revealStage >= 5 && analysis.keywords && (
        <AnalysisSection
          title="Job-Search Keywords"
          description="Search terms to try on job boards"
          items={analysis.keywords}
        />
      )}

    </div>
  );
}

function LiveJobsSection({
  analysis,
  jobs,
  isSearchingJobs,
  jobSearchMessage,
  jobSearchQuery,
  jobSearchLocation,
  jobSourceFilter,
  savedJobIds,
  hasAnalysed,
  onSaveJob,
  onJobSearchLocationChange,
  onJobSourceFilterChange,
  onRefreshJobs,
}: {
  analysis: AnalysisData | null;
  jobs: JobListing[];
  isSearchingJobs: boolean;
  jobSearchMessage: string;
  jobSearchQuery: string;
  jobSearchLocation: string;
  jobSourceFilter: JobSourceFilter;
  savedJobIds: string[];
  hasAnalysed: boolean;
  onSaveJob: (job: JobListing) => void;
  onJobSearchLocationChange: (location: string) => void;
  onJobSourceFilterChange: (filter: JobSourceFilter) => void;
  onRefreshJobs: () => void;
}) {
  const hasLiveJobs = jobs.length > 0;
  const adzunaCount = jobs.filter((job) => job.source === "Adzuna").length;
  const remotiveCount = jobs.filter((job) => job.source === "Remotive").length;
  const filteredJobs =
    jobSourceFilter === "All"
      ? jobs
      : jobs.filter((job) => job.source === jobSourceFilter);
  const savedJobIdSet = new Set(savedJobIds);

  return (
    <section className="rounded-3xl border border-purple/15 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6 lg:p-7">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-purple">
            {hasLiveJobs ? "Live Job Matches" : "Recommended Jobs"}
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#5f5875]">
            {hasLiveJobs
              ? "Live jobs from Adzuna and Remotive"
              : hasAnalysed
              ? "AI-generated suggestions based on your profile"
              : "Run your CV analysis to unlock live role matches."}
          </p>
        </div>

        {hasLiveJobs && (
          <div className="grid gap-2 rounded-2xl border border-purple/20 bg-purple/5 p-3 text-sm font-medium text-purple sm:grid-cols-3 xl:min-w-[360px]">
            <span>{jobs.length} live jobs</span>
            <span>{adzunaCount} Adzuna</span>
            <span>{remotiveCount} Remotive</span>
          </div>
        )}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <label
          htmlFor="job-location"
          className="text-xs font-semibold uppercase text-[#6d6384]"
        >
          Job Location
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="job-location"
            type="text"
            value={jobSearchLocation}
            onChange={(event) => onJobSearchLocationChange(event.target.value)}
            placeholder="e.g. London, Manchester, Remote"
            className="min-h-11 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition placeholder:text-slate-400 focus:border-purple focus:ring-4 focus:ring-purple/15"
          />
          <button
            type="button"
            onClick={onRefreshJobs}
            disabled={!analysis || isSearchingJobs}
            className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-purple px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-dark disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {isSearchingJobs && (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
            )}
            {isSearchingJobs ? "Searching..." : "Refresh Jobs"}
          </button>
        </div>
      </div>

      {hasLiveJobs && (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["All", "Adzuna", "Remotive"] as JobSourceFilter[]).map(
            (source) => (
              <button
                key={source}
                type="button"
                onClick={() => onJobSourceFilterChange(source)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                  jobSourceFilter === source
                    ? "border-purple bg-purple text-white"
                    : "border-slate-200 bg-white text-[#5f5875] hover:border-purple/30 hover:text-purple"
                }`}
              >
                {source}
              </button>
            ),
          )}
        </div>
      )}

      {isSearchingJobs && (
        <div className="mt-4 rounded-xl border border-purple/20 bg-purple/5 p-3 text-sm font-medium text-purple">
          Searching Adzuna and Remotive for live jobs...
        </div>
      )}

      {jobSearchMessage && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-800">
          {jobSearchMessage}
        </div>
      )}

      {hasLiveJobs && jobSearchQuery && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-[#6d6384]">
          Search query: {jobSearchQuery}
          {jobSearchLocation ? ` in ${jobSearchLocation}` : ""}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {!hasAnalysed ? (
          <div className="rounded-2xl border border-dashed border-purple/20 bg-[#f7f4fb] p-5 text-sm leading-6 text-[#5f5875] md:col-span-2 xl:col-span-3">
            Upload or paste a CV, then let RolePilot surface live job matches
            here.
          </div>
        ) : hasLiveJobs && filteredJobs.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-medium text-[#5f5875] md:col-span-2 xl:col-span-3">
            No {jobSourceFilter} jobs found for this search.
          </div>
        ) : hasLiveJobs ? (
          filteredJobs.map((job) => {
            const jobId = getJobId(job);
            const isSaved = savedJobIdSet.has(jobId);
            const workMode = inferWorkMode(job);

            return (
              <article
                key={`${job.title}-${job.company}-${job.sourceUrl}`}
                className={`flex min-h-[300px] flex-col rounded-2xl border bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-[0_14px_28px_rgba(109,40,217,0.12)] ${
                  job.source === "Adzuna"
                    ? "border-purple/20 hover:border-purple/40"
                    : "border-sky-200 hover:border-sky-300"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="line-clamp-2 text-base font-semibold leading-6 text-slate-950">
                    {job.title}
                  </p>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        job.source === "Adzuna"
                          ? "bg-purple/10 text-purple"
                          : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {job.source}
                    </span>
                    <WorkModeBadge mode={workMode} />
                  </div>
                </div>

                <div className="mt-3 space-y-1">
                  <p className="line-clamp-1 text-sm font-semibold text-slate-700">
                    {job.company}
                  </p>
                  <p className="line-clamp-1 text-sm text-[#6d6384]">
                    {job.location}
                  </p>
                  <p className="text-sm font-semibold text-purple">
                    {job.salary || "Salary not listed"}
                  </p>
                </div>

                <p className="mt-4 min-h-[60px] line-clamp-3 text-sm leading-5 text-[#4d4768]">
                  {job.descriptionSnippet || "No description provided."}
                </p>

                <div className="mt-auto grid gap-2 pt-5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => onSaveJob(job)}
                    disabled={isSaved}
                    className={`inline-flex h-10 min-w-24 w-full items-center justify-center whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition ${
                      isSaved
                        ? "cursor-not-allowed border-purple/20 bg-purple/10 text-purple"
                        : "border-slate-200 bg-white text-slate-700 hover:border-purple/30 hover:text-purple"
                    }`}
                  >
                    {isSaved ? "Saved" : "Save Job"}
                  </button>
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 min-w-24 w-full items-center justify-center whitespace-nowrap rounded-xl bg-purple px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-dark"
                  >
                    View Job
                  </a>
                </div>
              </article>
            );
          })
        ) : (
          analysis?.sampleJobs.map((job) => (
            <article
              key={`${job.title}-${job.company}`}
              className="flex min-h-[230px] flex-col rounded-2xl border border-slate-200 bg-slate-50 p-5 opacity-90 transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-sm"
            >
              <span className="mb-3 w-fit rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                AI-generated suggestions
              </span>
              <p className="line-clamp-2 text-base font-semibold leading-6 text-slate-950">
                {job.title}
              </p>
              <p className="mt-2 line-clamp-1 text-sm font-medium text-[#5f5875]">
                {job.company} - {job.location}
              </p>
              <div className="mt-4 flex-1 rounded-xl border border-purple/10 bg-purple/5 p-3">
                <p className="text-xs font-semibold uppercase text-purple">
                  Match reason
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-[#4d4768]">
                  Aligns with {analysis.targetRoles[0]} direction and key
                  skills such as {analysis.skills.slice(0, 2).join(" and ")}.
                </p>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function SavedJobsSection({
  savedJobs,
  onRemoveSavedJob,
  onUpdateSavedJobStatus,
}: {
  savedJobs: SavedJob[];
  onRemoveSavedJob: (jobId: string) => void;
  onUpdateSavedJobStatus: (jobId: string, status: ApplicationStatus) => void;
}) {
  const jobsByStatus = groupSavedJobsByStatus(savedJobs);

  return (
    <section
      id="saved-jobs"
      className="scroll-mt-24 rounded-3xl border border-purple/15 bg-white p-5 shadow-[0_18px_45px_rgba(15,23,42,0.08)] sm:p-6 lg:p-7"
    >
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-purple">Saved Jobs</h2>
          <p className="mt-1 text-sm leading-6 text-[#5f5875]">
            Track saved opportunities as they move from shortlist to offer.
          </p>
        </div>
        <span className="rounded-full bg-purple/10 px-2.5 py-1 text-xs font-semibold text-purple">
          {savedJobs.length} total
        </span>
      </div>

      {savedJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-purple/20 bg-[#f7f4fb] p-4 text-sm leading-6 text-[#5f5875]">
          No saved jobs yet. Save a live job to keep it here after refreshing
          the page.
        </div>
      ) : (
        <div className="-mx-2 overflow-x-auto overscroll-x-contain px-2 pb-3 [scrollbar-gutter:stable]">
          <div className="grid min-w-max grid-flow-col auto-cols-[280px] gap-4">
            {APPLICATION_STATUSES.map((status) => (
              <PipelineColumn
                key={status}
                status={status}
                jobs={jobsByStatus[status]}
                onRemoveSavedJob={onRemoveSavedJob}
                onUpdateSavedJobStatus={onUpdateSavedJobStatus}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PipelineColumn({
  status,
  jobs,
  onRemoveSavedJob,
  onUpdateSavedJobStatus,
}: {
  status: ApplicationStatus;
  jobs: SavedJob[];
  onRemoveSavedJob: (jobId: string) => void;
  onUpdateSavedJobStatus: (jobId: string, status: ApplicationStatus) => void;
}) {
  return (
    <div className="w-[280px] rounded-2xl border border-purple/10 bg-[#f7f4fb] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-slate-950">
          {status}
        </h3>
        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-purple">
          {jobs.length}
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="min-h-[96px] rounded-xl border border-dashed border-purple/20 bg-white/70 p-3 text-xs leading-5 text-[#6d6384]">
          No jobs in this stage.
        </div>
      ) : (
        <div className="grid auto-rows-fr gap-3">
          {jobs.map((job) => (
            <SavedJobCard
              key={getJobId(job)}
              job={job}
              onRemoveSavedJob={onRemoveSavedJob}
              onUpdateSavedJobStatus={onUpdateSavedJobStatus}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SavedJobCard({
  job,
  onRemoveSavedJob,
  onUpdateSavedJobStatus,
}: {
  job: SavedJob;
  onRemoveSavedJob: (jobId: string) => void;
  onUpdateSavedJobStatus: (jobId: string, status: ApplicationStatus) => void;
}) {
  const jobId = getJobId(job);

  return (
    <article className="flex h-full min-h-[330px] min-w-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
            {job.title}
          </p>
          <p className="mt-1 line-clamp-1 text-xs font-medium text-[#5f5875]">
            {job.company}
          </p>
          <p className="mt-0.5 line-clamp-1 text-xs text-[#6d6384]">
            {job.location}
          </p>
        </div>
        <span
          className={`max-w-[82px] shrink-0 truncate whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            job.source === "Adzuna"
              ? "bg-purple/10 text-purple"
              : "bg-sky-100 text-sky-700"
          }`}
        >
          {job.source}
        </span>
      </div>

      <div className="mt-3 grid gap-2">
        <StatusBadge status={job.status} />
        <p className="line-clamp-1 text-xs font-semibold text-purple">
          {job.salary || "Salary not listed"}
        </p>
      </div>

      <div className="mt-auto pt-4">
        <label
          htmlFor={`status-${jobId}`}
          className="block text-xs font-semibold uppercase text-[#6d6384]"
        >
          Status
        </label>
        <select
          id={`status-${jobId}`}
          value={job.status}
          onChange={(event) =>
            onUpdateSavedJobStatus(
              jobId,
              event.target.value as ApplicationStatus,
            )
          }
          className="mt-1 h-10 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 outline-none transition focus:border-purple focus:ring-4 focus:ring-purple/15"
        >
          {APPLICATION_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid gap-2">
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-10 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-xl bg-purple px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-purple-dark"
        >
          View Job
        </a>
        <button
          type="button"
          onClick={() => onRemoveSavedJob(jobId)}
          className="inline-flex h-10 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-red-200 hover:text-red-700"
        >
          Remove
        </button>
      </div>
    </article>
  );
}

function groupSavedJobsByStatus(savedJobs: SavedJob[]) {
  return savedJobs.reduce(
    (groups, job) => ({
      ...groups,
      [job.status]: [...groups[job.status], job],
    }),
    {
      Saved: [],
      Applied: [],
      Interviewing: [],
      Offer: [],
      Rejected: [],
      Withdrawn: [],
      "No Response": [],
    } satisfies Record<ApplicationStatus, SavedJob[]>,
  );
}

function StatusBadge({ status }: { status: ApplicationStatus }) {
  const styles: Record<ApplicationStatus, string> = {
    Saved: "bg-slate-100 text-slate-700",
    Applied: "bg-blue-100 text-blue-700",
    Interviewing: "bg-emerald-100 text-emerald-700",
    Offer: "bg-purple/10 text-purple",
    Rejected: "bg-red-100 text-red-700",
    Withdrawn: "bg-amber-100 text-amber-800",
    "No Response": "bg-slate-200 text-slate-700",
  };

  return (
    <span
      className={`w-fit max-w-full whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function WorkModeBadge({ mode }: { mode: WorkMode }) {
  const styles: Record<WorkMode, string> = {
    Remote: "bg-emerald-100 text-emerald-700",
    Hybrid: "bg-blue-100 text-blue-700",
    "On-site": "bg-slate-100 text-slate-700",
    "Location unclear": "bg-amber-100 text-amber-800",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[mode]}`}
    >
      {mode}
    </span>
  );
}

function AnalysisSection({
  title,
  description,
  items,
  delay = 0,
}: {
  title: string;
  description?: string;
  items: string[];
  delay?: number;
}) {
  return (
    <section
      className="result-pop rounded-2xl border border-purple/15 bg-white p-4 shadow-[0_12px_30px_rgba(15,23,42,0.07)] transition hover:-translate-y-0.5 hover:border-purple/40 hover:shadow-[0_18px_40px_rgba(109,40,217,0.1)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <ResultHeader title={title} description={description} />
      <div className="mt-3 flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
        {items.map((item, index) => (
          <span
            key={item}
            className="max-w-full rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium leading-5 text-slate-800 transition hover:border-purple/30 hover:bg-purple/5"
            style={{ transitionDelay: `${index * 20}ms` }}
          >
            {item}
          </span>
        ))}
      </div>
    </section>
  );
}

function ResultHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-purple">{title}</h3>
      {description && (
        <p className="mt-1 text-xs leading-5 text-[#6d6384]">{description}</p>
      )}
    </div>
  );
}
