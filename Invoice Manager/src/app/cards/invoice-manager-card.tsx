import React from "react";
import { hubspot, Text, Flex, Button } from "@hubspot/ui-extensions";

function getCompanyId(context: unknown): string | null {
  if (context && typeof context === "object") {
    const anyCtx = context as any;
    const id =
      anyCtx?.crm?.objectId ??
      anyCtx?.crm?.recordId ??
      anyCtx?.objectId ??
      null;
    return id ? String(id) : null;
  }
  return null;
}

function getOpenIframeModal(actions: unknown):
  | ((args: {
      uri: string;
      title?: string;
      width?: number;
      height?: number;
    }) => void)
  | null {
  if (actions && typeof actions === "object") {
    const fn = (actions as any)?.openIframeModal;
    return typeof fn === "function" ? fn : null;
  }
  return null;
}

hubspot.extend(({ context, actions }) => {
  const companyId = getCompanyId(context);
  const openIframeModal = getOpenIframeModal(actions);
  const canOpen = Boolean(companyId && openIframeModal);

  return (
    <Flex direction="column" gap="md">
      <Text format={{ fontWeight: "bold" }}>Invoice Manager</Text>

      <Text>Company ID: {companyId ?? "N/A"}</Text>

      {!openIframeModal && (
        <Text>Modal is not available in this location.</Text>
      )}

      <Button
        disabled={!canOpen}
        onClick={() => {
          if (!companyId || !openIframeModal) return;
          openIframeModal({
            uri: `https://hs-invoice-manager.onrender.com/?companyId=${companyId}`,
            title: "Invoice Manager",
            width: 1200,
            height: 800,
          });
        }}
      >
        Open Invoice Manager
      </Button>
    </Flex>
  );
});
