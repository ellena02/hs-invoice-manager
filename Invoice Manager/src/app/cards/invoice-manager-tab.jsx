import React from "react";
import {
  hubspot,
  Text,
  Flex,
  Button,
} from "@hubspot/ui-extensions";

hubspot.extend(({ context, actions }) => {
  const companyId = context?.crm?.objectId;

  return (
    <Flex direction="column" gap="md">
      <Text format={{ fontWeight: "bold" }}>
        Invoice Manager
      </Text>

      <Text>
        Company ID: {companyId ?? "N/A"}
      </Text>

      <Button
        disabled={!companyId}
        onClick={() =>
          actions.openIframeModal({
            // ✅ PASS companyId INTO THE IFRAME URL
            uri: `https://hs-invoice-manager.onrender.com/?companyId=${companyId}`,
            title: "Invoice Manager",
            width: 1200,
            height: 800,
          })
        }
      >
        Open Invoice Manager
      </Button>
    </Flex>
  );
});
