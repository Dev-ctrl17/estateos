"use client";
import { FormEvent, useEffect, useState } from "react";
import {
  CalendarDays,
  CircleCheck,
  LayoutDashboard,
  Settings,
  Sparkles,
  Users,
  Video,
  Workflow,
} from "lucide-react";
const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/v1";
const nav = [
  [LayoutDashboard, "Overview"],
  [Users, "Clients"],
  [Workflow, "Properties"],
  [Sparkles, "Content queue"],
  [Video, "Video studio"],
  [CircleCheck, "Approval center"],
  [CalendarDays, "Calendar"],
  [Settings, "Settings"],
] as const;
type Dashboard = {
  tenant: {
    id: string;
    name: string;
    website?: string;
    brandProfile?: { tone: string; cta: string };
  };
  properties: any[];
  campaigns: any[];
  metrics: {
    activeProperties: number;
    awaitingApproval: number;
    totalCampaigns: number;
  };
};
async function request(path: string, options?: RequestInit) {
  try {
    const response = await fetch(`${api}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!response.ok) {
      const err = await response.json().catch(() => null);
      throw new Error(
        err?.message ?? err?.error ?? `Server error (${response.status})`
      );
    }
    return response.json();
  } catch (err: any) {
    if (err.name === "TypeError" || err.message?.includes("fetch")) {
      throw new Error("Unable to connect to backend server. Render free tier backend may be waking up (cold start, ~30–60s). Please retry shortly.");
    }
    throw err;
  }
}
export default function Home() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [data, setData] = useState<Dashboard | null>(null);
  const [page, setPage] = useState("Overview");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const load = async (id = tenantId) => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await request(`/tenants/${id}/dashboard`));
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Unable to load workspace",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    const saved = localStorage.getItem("estateos-tenant-id");
    setTenantId(saved);
    if (saved) load(saved);
    else setLoading(false);
  }, []);
  const onboard = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const tenant = await request("/tenants/onboard", {
        method: "POST",
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
          website: form.get("website"),
          brand: { tone: form.get("tone"), cta: form.get("cta") },
        }),
      });
      localStorage.setItem("estateos-tenant-id", tenant.id);
      setTenantId(tenant.id);
      setData({
        tenant,
        properties: [],
        campaigns: [],
        metrics: {
          activeProperties: 0,
          awaitingApproval: 0,
          totalCampaigns: 0,
        },
      });
      setNotice("Workspace created. Add your first property.");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not create workspace",
      );
    }
  };
  const createProperty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId) return;
    const form = new FormData(event.currentTarget);
    try {
      await request(`/tenants/${tenantId}/properties`, {
        method: "POST",
        body: JSON.stringify({
          externalId: form.get("externalId"),
          title: form.get("title"),
          address: form.get("address"),
          type: form.get("type"),
          price: Number(form.get("price")),
          currency: form.get("currency") || "NGN",
          bedrooms: Number(form.get("bedrooms")) || undefined,
          bathrooms: Number(form.get("bathrooms")) || undefined,
          images: String(form.get("images") || "")
            .split("\n")
            .filter(Boolean),
          amenities: String(form.get("amenities") || "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          status: "ACTIVE",
          sourcePayload: { source: "manual-dashboard" },
        }),
      });
      event.currentTarget.reset();
      setNotice("Listing saved. The AI workflow has been queued.");
      await load();
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not add property",
      );
    }
  };
  const importJson = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId) return;
    const form = new FormData(event.currentTarget);
    try {
      const properties = JSON.parse(String(form.get("properties")));
      await request(`/tenants/${tenantId}/properties/import`, {
        method: "POST",
        body: JSON.stringify({ properties }),
      });
      setNotice(`${properties.length} listings queued for import.`);
      await load();
    } catch {
      setNotice("Import failed. Use a JSON array of property objects.");
    }
  };
  const poll = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!tenantId) return;
    const form = new FormData(event.currentTarget);
    setNotice("Connecting to your property feed…");
    try {
      await request(`/property-sources/${tenantId}/poll`, {
        method: "POST",
        body: JSON.stringify({
          kind: form.get("kind"),
          url: form.get("url"),
          token: form.get("token") || undefined,
          itemsPath: form.get("itemsPath") || undefined,
          postType: form.get("postType") || undefined,
        }),
      });
      setNotice("Feed poll started. Imported listings will appear shortly.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Feed import failed");
    }
  };
  const approve = async (campaignId: string) => {
    try {
      await request(`/campaigns/${campaignId}/approve`, {
        method: "POST",
        body: JSON.stringify({ reviewerId: "agency-admin" }),
      });
      setNotice(
        "Campaign approved. It is ready to schedule after social accounts are connected.",
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Approval failed");
    }
  };
  if (!tenantId || !data)
    return <Onboarding onSubmit={onboard} notice={notice} />;
  const content =
    page === "Properties" ? (
      <Properties
        properties={data.properties}
        onCreate={createProperty}
        onImport={importJson}
        onPoll={poll}
      />
    ) : page === "Approval center" || page === "Content queue" ? (
      <Campaigns campaigns={data.campaigns} onApprove={approve} />
    ) : page === "Settings" ? (
      <SettingsPage tenant={data.tenant} />
    ) : (
      <Overview data={data} onOpenProperties={() => setPage("Properties")} />
    );
  return (
    <main className="shell">
      <aside>
        <div className="brand">
          <span>e</span> estateOS
        </div>
        <p className="workspace">{data.tenant.name.toUpperCase()}</p>
        <nav>
          {nav.map(([Icon, label]) => (
            <button
              className={page === label ? "active" : ""}
              onClick={() => setPage(label)}
              key={label}
            >
              <Icon size={18} />
              {label}
              {label === "Approval center" &&
                data.metrics.awaitingApproval > 0 && (
                  <b>{data.metrics.awaitingApproval}</b>
                )}
            </button>
          ))}
        </nav>
        <div className="profile">
          <div className="avatar">AO</div>
          <div>
            <strong>Agency admin</strong>
            <small>Workspace owner</small>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">LIVE WORKSPACE</p>
            <h1>{page}</h1>
            <p className="sub">
              {data.tenant.website || "Your Supabase-backed EstateOS workspace"}
            </p>
          </div>
          <button className="new" onClick={() => setPage("Properties")}>
            <Sparkles size={16} /> Add property
          </button>
        </header>
        {notice && <p className="notice">{notice}</p>}
        {loading ? <p>Loading workspace…</p> : content}
      </section>
    </main>
  );
}
function Onboarding({
  onSubmit,
  notice,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  notice: string;
}) {
  return (
    <main className="onboarding">
      <section className="onboardingIntro">
        <div className="brandMark">
          <span>e</span>
          <strong>estateOS</strong>
        </div>
        <p className="eyebrow">THE INTELLIGENCE LAYER FOR PROPERTY TEAMS</p>
        <h1>Turn every listing into a reason to move.</h1>
        <p className="introCopy">
          Connect your agency, brand voice, and property pipeline in one calm
          workspace built for high-intent marketing.
        </p>
        <div className="introStats">
          <div>
            <strong>01</strong>
            <span>Connect your brand</span>
          </div>
          <div>
            <strong>02</strong>
            <span>Sync your listings</span>
          </div>
          <div>
            <strong>03</strong>
            <span>Approve &amp; publish</span>
          </div>
        </div>
      </section>
      <form className="panel form" onSubmit={onSubmit}>
        <div className="formHeader">
          <p className="eyebrow">ESTATEOS SETUP</p>
          <span className="step">STEP 1 / 1</span>
        </div>
        <h2>Create your agency workspace</h2>
        <p className="sub">
          Your workspace keeps listings, campaigns, and approvals together.
        </p>
        <div className="fieldGrid">
          <label>
            Agency name
            <input name="name" placeholder="Luxury Properties Ltd" required />
          </label>
          <label>
            Workspace slug
            <input name="slug" placeholder="luxury-properties" required />
          </label>
        </div>
        <label>
          Website URL <span className="optional">OPTIONAL</span>
          <input
            name="website"
            type="url"
            placeholder="https://youragency.com"
          />
        </label>
        <div className="fieldGrid">
          <label>
            Brand tone
            <input
              name="tone"
              placeholder="Warm, informed, aspirational"
              defaultValue="Warm, informed, aspirational"
            />
          </label>
          <label>
            Primary call to action
            <input
              name="cta"
              placeholder="Book a private viewing"
              defaultValue="Book a private viewing"
            />
          </label>
        </div>
        <button className="new" type="submit">
          Create workspace <span>→</span>
        </button>
        {notice && <p className="notice">{notice}</p>}
        <p className="formFoot">
          You can refine your brand profile and connect a property feed after
          setup.
        </p>
      </form>
    </main>
  );
}
function Overview({
  data,
  onOpenProperties,
}: {
  data: Dashboard;
  onOpenProperties: () => void;
}) {
  return (
    <>
      <div className="metrics">
        <Metric
          label="Active properties"
          value={data.metrics.activeProperties}
          note="Synced from your sources"
        />
        <Metric
          label="Awaiting approval"
          value={data.metrics.awaitingApproval}
          note="Human review required"
          emphasis
        />
        <Metric
          label="Campaigns"
          value={data.metrics.totalCampaigns}
          note="Generated and saved"
        />
        <Metric
          label="AI provider"
          value={(process.env.NEXT_PUBLIC_AI_PROVIDER ?? "Auto").toUpperCase()}
          note="OpenAI with Gemini fallback"
        />
      </div>
      <section className="panel queue">
        <div className="panelHead">
          <div>
            <p className="eyebrow">RECENT LISTINGS</p>
            <h2>Property pipeline</h2>
          </div>
          <button className="link" onClick={onOpenProperties}>
            Manage properties
          </button>
        </div>
        {data.properties.length ? (
          data.properties.slice(0, 5).map((property) => (
            <article key={property.id}>
              <div className="property">
                <span>{property.type.slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="campaign">
                <strong>{property.title}</strong>
                <small>
                  {property.address} · {property.currency}{" "}
                  {Number(property.price).toLocaleString()}
                </small>
              </div>
              <span className="pill p2">{property.status}</span>
            </article>
          ))
        ) : (
          <p>No listings yet. Add one in Properties to begin.</p>
        )}
      </section>
    </>
  );
}
function Properties({ properties, onCreate, onImport, onPoll }: any) {
  return (
    <div className="twoColumns">
      <section className="panel form">
        <h2>Add a listing</h2>
        <form onSubmit={onCreate}>
          <input name="externalId" placeholder="Listing ID" required />
          <input name="title" placeholder="Property title" required />
          <input name="address" placeholder="Address" required />
          <input
            name="type"
            placeholder="Property type"
            defaultValue="Apartment"
            required
          />
          <input name="price" type="number" placeholder="Price" required />
          <input name="currency" placeholder="Currency" defaultValue="NGN" />
          <input name="bedrooms" type="number" placeholder="Bedrooms" />
          <input name="bathrooms" type="number" placeholder="Bathrooms" />
          <textarea name="images" placeholder="One public image URL per line" />
          <input
            name="amenities"
            placeholder="Amenities, separated by commas"
          />
          <button className="new">Save and generate campaign</button>
        </form>
      </section>
      <section className="panel form">
        <h2>Import listings</h2>
        <form onSubmit={onImport}>
          <textarea
            name="properties"
            placeholder='[{"externalId":"LP-001","title":"...","address":"...","type":"Apartment","price":250000000,"currency":"NGN","images":[],"amenities":[]}]'
            required
          />
          <button className="new">Import JSON</button>
        </form>
        <hr />
        <h2>Connect a feed</h2>
        <form onSubmit={onPoll}>
          <select name="kind">
            <option value="rest">REST JSON feed</option>
            <option value="wordpress">WordPress</option>
          </select>
          <input
            name="url"
            type="url"
            placeholder="Feed or website URL"
            required
          />
          <input
            name="token"
            type="password"
            placeholder="Bearer API key (optional)"
            autoComplete="off"
          />
          <input
            name="itemsPath"
            placeholder="REST items path, e.g. data.items"
          />
          <input name="postType" placeholder="WordPress post type (optional)" />
          <button className="new">Poll source</button>
        </form>
      </section>
      <section className="panel queue wide">
        <h2>Saved properties</h2>
        {properties.map((property: any) => (
          <article key={property.id}>
            <div className="campaign">
              <strong>{property.title}</strong>
              <small>
                {property.address} · {property.currency}{" "}
                {Number(property.price).toLocaleString()}
              </small>
            </div>
            <span className="pill p2">{property.status}</span>
          </article>
        ))}
        {!properties.length && <p>No saved properties.</p>}
      </section>
    </div>
  );
}
function Campaigns({
  campaigns,
  onApprove,
}: {
  campaigns: any[];
  onApprove: (id: string) => void;
}) {
  return (
    <section className="panel queue">
      {campaigns.length ? (
        campaigns.map((campaign) => (
          <article key={campaign.id}>
            <div className="campaign">
              <strong>{campaign.property.title}</strong>
              <small>
                {campaign.status} · {campaign.content.length} generated assets
              </small>
            </div>
            <span className="pill p0">{campaign.status}</span>
            {campaign.status === "AWAITING_APPROVAL" && (
              <button
                className="approve"
                onClick={() => onApprove(campaign.id)}
              >
                Approve
              </button>
            )}
          </article>
        ))
      ) : (
        <p>No campaigns yet. Import a property to start the AI workflow.</p>
      )}
    </section>
  );
}
function SettingsPage({ tenant }: { tenant: Dashboard["tenant"] }) {
  return (
    <section className="panel">
      <h2>Workspace settings</h2>
      <p>
        <strong>Agency:</strong> {tenant.name}
      </p>
      <p>
        <strong>AI routing:</strong> Set <code>AI_PROVIDER</code> to{" "}
        <code>auto</code>, <code>openai</code>, or <code>gemini</code>.
      </p>
      <p>
        <strong>Brand tone:</strong> {tenant.brandProfile?.tone}
      </p>
      <p>
        <strong>Call to action:</strong> {tenant.brandProfile?.cta}
      </p>
    </section>
  );
}
function Metric({
  label,
  value,
  note,
  emphasis,
}: {
  label: string;
  value: string | number;
  note: string;
  emphasis?: boolean;
}) {
  return (
    <section className={`metric ${emphasis ? "attention" : ""}`}>
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{note}</small>
    </section>
  );
}
