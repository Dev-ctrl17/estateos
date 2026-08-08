"use client";
import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
export default function BrandPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const [brand, setBrand] = useState<any>({});
  const [message, setMessage] = useState("");
  useEffect(() => {
    api<any>(`/tenants/${tenantId}/dashboard`).then((d) =>
      setBrand(d.tenant.brandProfile || {}),
    );
  }, [tenantId]);
  async function save(e: FormEvent) {
    e.preventDefault();
    await api(`/tenants/${tenantId}/brand`, {
      method: "PUT",
      body: JSON.stringify(brand),
    });
    setMessage("Brand profile saved.");
  }
  return (
    <main className="formPage">
      <div className="formCard">
        <Link href={`/workspace/${tenantId}`}>← Workspace</Link>
        <p className="eyebrow">BRAND PROFILE</p>
        <h1>Shape every campaign</h1>
        <form onSubmit={save}>
          <label>
            Tone
            <textarea
              value={brand.tone || ""}
              onChange={(e) => setBrand({ ...brand, tone: e.target.value })}
            />
          </label>
          <label>
            Primary colour
            <input
              value={brand.primaryColor || ""}
              onChange={(e) =>
                setBrand({ ...brand, primaryColor: e.target.value })
              }
            />
          </label>
          <label>
            Default CTA
            <input
              value={brand.cta || ""}
              onChange={(e) => setBrand({ ...brand, cta: e.target.value })}
            />
          </label>
          <label>
            Promotion or referral brief
            <textarea
              value={brand.promotionBrief || ""}
              onChange={(e) =>
                setBrand({ ...brand, promotionBrief: e.target.value })
              }
              placeholder="Explain the offer, eligibility, referral reward, dates, locations, and the action prospects should take."
            />
          </label>
          <label>
            Forbidden words
            <input
              value={(brand.forbiddenWords || []).join(", ")}
              onChange={(e) =>
                setBrand({
                  ...brand,
                  forbiddenWords: e.target.value
                    .split(",")
                    .map((v: string) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          {message && <p className="success">{message}</p>}
          <button className="primary">Save brand profile</button>
        </form>
      </div>
    </main>
  );
}
