import "./reset.css";
import "./base.css";
import { StrictMode, Suspense, lazy, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GlobalContextProviders } from "./components/_globalContextProviders";
import { AuthLoadingState } from "./components/AuthLoadingState";

// File-based routes: pages/jobs.$jobId.tsx → /jobs/:jobId, pages/_index.tsx → /.
// pages/<name>.pageLayout.tsx exports the shells (outermost first) that wrap that page.

type Layout = ComponentType<{ children: ReactNode }>;
const pageModules = import.meta.glob<{ default: ComponentType }>(["./pages/*.tsx", "!./pages/*.pageLayout.tsx", "!./pages/*.spec.tsx"]);
const layoutModules = import.meta.glob<Layout[]>("./pages/*.pageLayout.tsx", { eager: true, import: "default" });

const nameOf = (file: string) => file.replace(/^\.\/pages\//, "").replace(/\.(pageLayout\.)?tsx$/, "");
const pathOf = (name: string) =>
  name === "_index"
    ? "/"
    : "/" +
      name
        .split(".")
        .map((seg) => (seg.startsWith("$") ? `:${seg.slice(1)}` : seg))
        .join("/");

const routes = Object.entries(pageModules).map(([file, load]) => {
  const name = nameOf(file);
  const Page = lazy(load);
  const layouts = layoutModules[`./pages/${name}.pageLayout.tsx`] ?? [];
  const element = layouts.reduceRight<ReactNode>((child, L) => <L>{child}</L>, <Page />);
  return { path: pathOf(name), element };
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <GlobalContextProviders>
        <Suspense fallback={<AuthLoadingState title="Loading" />}>
          <Routes>
            {routes.map((r) => (
              <Route key={r.path} path={r.path} element={r.element} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </GlobalContextProviders>
    </BrowserRouter>
  </StrictMode>,
);
