"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", slug: "", website: "", tone: "Warm, informed, aspirational", cta: "Book a private viewing" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); setSaving(true); setError(""); try { const result = await api<any>("/tenants/onboard", { method: "POST", body: JSON.stringify({ name: form.name, slug: form.slug, website: form.website, brand: { tone: form.tone, cta: form.cta } }) }); localStorage.setItem("estateos.tenantId", result.id); router.push(`/workspace/${result.id}`); } catch (e) { setError(e instanceof Error ? e.message : "Could not create workspace"); } finally { setSaving(false); } }
  return <main className="formPage"><div className="formCard"><p className="eyebrow">ESTATEOS SETUP</p><h1>Create your agency workspace</h1><p className="sub">This creates your tenant and brand profile in Supabase.</p><form onSubmit={submit}><label>Agency name<input required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Luxury Properties Ltd" /></label><label>Workspace slug<input required value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} placeholder="luxury-properties" /></label><label>Website URL<input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="https://example.com" /></label><label>Brand tone<textarea value={form.tone} onChange={e => setForm({ ...form, tone: e.target.value })} /></label><label>Default call to action<input value={form.cta} onChange={e => setForm({ ...form, cta: e.target.value })} /></label>{error && <p className="error">{error}</p>}<button className="primary" disabled={saving}>{saving ? "Creating workspace…" : "Create workspace"}</button></form></div></main>;
}
