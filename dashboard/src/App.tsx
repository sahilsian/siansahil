import { Link, Navigate, Route, Routes, useParams } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { RequireSignIn, useSite } from "./session";
import { Layout } from "./components/Layout";
import { Spinner } from "./components/ui";
import { humanize } from "./lib/fields";
import { TextEditor } from "./pages/TextEditor";
import { Gallery } from "./pages/Gallery";
import { ArtworkEditor } from "./pages/ArtworkEditor";
import { Superadmin } from "./pages/Superadmin";
import { Login } from "./pages/Login";
import { Account } from "./pages/Account";
import { MailingList } from "./pages/MailingList";
import { PrintEditor, Prints } from "./pages/Prints";
import { Orders } from "./pages/Orders";

function PageText({ slug, title, description }: { slug: string; title: string; description?: string }) {
  const { site } = useSite();
  return (
    <TextEditor
      key={`${site.id}/${slug}`}
      title={title}
      description={description ?? "Edit the words on this page. Layout and links stay as they are."}
      refs={[{ type: "page", key: slug, title: `${title} page` }]}
    />
  );
}

function OtherPage() {
  const { slug = "" } = useParams();
  return <PageText slug={slug} title={humanize(slug)} />;
}

function Reusable() {
  const { site } = useSite();
  return (
    <TextEditor
      key={`${site.id}/reusable`}
      title="Reusable"
      description="Text shared across the whole site: header, footer, mailing list, buttons and messages."
      refs={[{ type: "site", key: "main", title: "Site-wide text" }]}
    />
  );
}

/** Land on the first page this site has. */
function Start() {
  const { site } = useSite();
  const { data } = useQuery({ queryKey: ["documents", site.id], queryFn: () => api.documents(site.id) });
  if (!data) return <Spinner />;
  const hasHome = data.some((d) => d.type === "page" && d.key === "home");
  return <Navigate to={hasHome ? "/home" : "/reusable"} replace />;
}

function SuperadminOnly() {
  const { me } = useSite();
  return me.user.role === "superadmin" ? <Superadmin /> : <Navigate to="/" replace />;
}

function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <Link to="/" className="text-sm underline">
        Go to the dashboard
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireSignIn>
            <Layout />
          </RequireSignIn>
        }
      >
        <Route index element={<Start />} />
        <Route path="home" element={<PageText slug="home" title="Home" />} />
        <Route path="about" element={<PageText slug="about" title="About" />} />
        <Route path="faq" element={<PageText slug="faq" title="FAQ" />} />
        <Route path="contact" element={<PageText slug="contact" title="Contact" />} />
        <Route path="reusable" element={<Reusable />} />
        <Route path="pages/:slug" element={<OtherPage />} />
        <Route path="gallery" element={<Gallery />} />
        <Route path="gallery/new" element={<ArtworkEditor />} />
        <Route path="gallery/:slug" element={<ArtworkEditor />} />
        <Route path="superadmin" element={<SuperadminOnly />} />
        <Route path="account" element={<Account />} />
        <Route path="mailing-list" element={<MailingList />} />
        <Route path="orders" element={<Orders />} />
        <Route path="prints" element={<Prints />} />
        <Route path="prints/new" element={<PrintEditor />} />
        <Route path="prints/:slug" element={<PrintEditor />} />
        <Route path="store" element={<Navigate to="/prints" replace />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
