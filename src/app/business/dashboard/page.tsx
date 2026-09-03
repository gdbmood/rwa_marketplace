import { redirect } from "next/navigation";
import BusinessAuthGate from "@/components/business/auth-gate";
import DashboardView from "@/components/business/dashboard-view";
import { BusinessPageShell, NotBusinessNotice } from "@/components/business/page-shell";
import { getBusinessGate, loadBusinessDashboard } from "@/components/business/server";

export const dynamic = "force-dynamic";

/**
 * Business dashboard, server rendered: assets in every status (drafts show as
 * Coming soon), sales metrics from v_business_dashboard, transactions list.
 * All data is scoped to the session user server side.
 */
export default async function DashboardPage() {
    const gate = await getBusinessGate();

    if (gate.status === "unauthenticated") {
        return (
            <BusinessPageShell>
                <BusinessAuthGate message="Connect your business wallet to open the dashboard" />
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
    if (gate.status === "unverified") {
        redirect("/verify-business");
    }

    const data = await loadBusinessDashboard(gate.user);

    return (
        <BusinessPageShell>
            <DashboardView assets={data.assets} transactions={data.transactions} />
        </BusinessPageShell>
    );
}
