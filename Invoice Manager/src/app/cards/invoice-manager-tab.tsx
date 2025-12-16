import React from "react";
import { hubspot, Text, Flex, Button } from "@hubspot/ui-extensions";

type ExtendArgs = {
  context?: any;
};

hubspot.extend((args: ExtendArgs) => {
  const context = args?.context;

  const companyId =
    context?.crm?.objectId ??
    context?.crm?.recordId ??
    context?.objectId ??
    null;

  const url = companyId
    ? `https://hs-invoice-manager.onrender.com/?companyId=${companyId}`
    : "https://hs-invoice-manager.onrender.com/";

  return (
    <Flex direction="column" gap="md">
      <Text format={{ fontWeight: "bold" }}>Invoice Manager</Text>
      <Text>Company ID: {companyId ?? "N/A"}</Text>

      <Text>Open the full Invoice Manager UI in a new tab:</Text>

      <Button
        disabled={!companyId}
        onClick={() => {
          window.open(url, "_blank");
        }}
      >
        Open in new tab
      </Button>
    </Flex>
  );
});
