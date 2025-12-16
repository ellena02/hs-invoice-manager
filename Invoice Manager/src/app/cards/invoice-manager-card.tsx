import React from "react";
import { hubspot, Text, Flex, Button } from "@hubspot/ui-extensions";

type ExtendArgs = {
  context?: any;
  actions?: any;
};

hubspot.extend((args: ExtendArgs) => {
  const context = args?.context;
  const actions = args?.actions;

  const companyId =
    context?.crm?.objectId ??
    context?.crm?.recordId ??
    context?.objectId ??
    null;

  const canOpen = Boolean(companyId && actions?.openIframeModal);

  const open = () => {
    if (!companyId || !actions?.openIframeModal) return;

    actions.openIframeModal({
      uri: `https://hs-invoice-manager.onrender.com/?companyId=${companyId}`,
      title: "Invoice Manager",
      width: 1200,
      height: 800,
    });
  };

  return (
    <Flex direction="column" gap="md">
      <Text format={{ fontWeight: "bold" }}>Invoice Manager</Text>

      <Text>Company ID: {companyId ?? "N/A"}</Text>

      {!actions?.openIframeModal && (
        <Text>Modal action not available here.</Text>
      )}

      <Button disabled={!canOpen} onClick={open}>
        Open Invoice Manager
      </Button>
    </Flex>
  );
});
