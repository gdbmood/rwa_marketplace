import { redirect } from "next/navigation";
import BusinessAuthGate from "@/components/business/auth-gate";
import SumsubPanel from "@/components/business/sumsub-panel";
import { BusinessPageShell, NotBusinessNotice } from "@/components/business/page-shell";
import { getBusinessGate } from "@/components/business/server";

export const dynamic = "force-dynamic";

/** Business verification (KYB) via Sumsub, gated on a verified session. */
export default async function VerifyBusinessPage() {
    const gate = await getBusinessGate();

    if (gate.status === "unauthenticated") {
        return (
            <BusinessPageShell>
                <BusinessAuthGate message="Connect your business wallet to verify your company" />
            </BusinessPageShell>
        );
    }
    if (gate.status === "not_business") {
        return (
            <BusinessPageShell>
                <NotBusinessNotice />
            </BusinessPageShell>
        );
    }
    if (gate.status === "ok") {
        redirect("/dashboard");
    }

    return (
        <BusinessPageShell>
            <SumsubPanel level="id-and-liveness" />
        </BusinessPageShell>
    );
}
