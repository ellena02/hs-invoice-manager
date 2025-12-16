import React from "react";
import {
  hubspot,
  Text,
  Flex,
  Button,
} from "@hubspot/ui-extensions";

hubspot.extend(({ context, actions }) => (
  <Flex direction="column" gap="md">
    <Text format={{ fontWeight: "bold" }}>
      Invoice Manager (Company Tab)
    </Text>

    <Text>
      Company ID: {context?.crm?.objectId ?? "N/A"}
    </Text>

    <Button
      onClick={() =>
        actions.openIframeModal({
          uri: "https://hs-invoice-manager.onrender.com/",
          title: "Invoice Manager",
          width: 1200,
          height: 800,
        })
      }
    >
      Open Invoice Manager
    </Button>
  </Flex>
));
