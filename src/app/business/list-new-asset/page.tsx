import { redirect } from "next/navigation";
import BusinessAuthGate from "@/components/business/auth-gate";
import ListNewAssetView, { type DraftSeed } from "@/components/business/list-new-asset-view";
import { BusinessPageShell, NotBusinessNotice } from "@/components/business/page-shell";
import { draftFormValues, getBusinessGate, loadCategoryDtos } from "@/components/business/server";
import { getAssetById } from "@/lib/db/assets";

export const dynamic = "force-dynamic";

/**
 * Business listing creation, draft first. `?draft=<assetId>` resumes one of
 * the caller's saved drafts; minting or active drafts route to their homes.
 */
export default async function ListNewAssetPage(props: {
    searchParams: Promise<{ draft?: string | string[] }>;
}) {
    const gate = await getBusinessGate();

    if (gate.status === "unauthenticated") {
        return (
            <BusinessPageShell>
                <BusinessAuthGate message="Connect your business wallet to list a new asset" />
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

    const categories = await loadCategoryDtos();

    const searchParams = await props.searchParams;
    const draftParam = Array.isArray(searchParams.draft) ? searchParams.draft[0] : searchParams.draft;

    let initialDraft: DraftSeed | null = null;
    if (draftParam) {
        const asset = await getAssetById(draftParam).catch(() => null);
        if (!asset || asset.business_id !== gate.user.id) {
            redirect("/list-new-asset");
        }
        if (asset.status !== "draft") {
            redirect("/dashboard");
        }
        initialDraft = { id: asset.id, values: draftFormValues(asset, categories) };
    }

    return (
        <BusinessPageShell>
            <ListNewAssetView
                categories={categories}
                initialDraft={initialDraft}
                businessDisplayName={gate.user.display_name ?? ""}
            />
        </BusinessPageShell>
    );
}
