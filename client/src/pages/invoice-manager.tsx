import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle2,
  AlertCircle,
  Building2,
  FileText,
  DollarSign,
  Loader2,
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompanyData, Deal, Invoice } from "@shared/schema";

const PAGE_SIZE = 10;

/* ---------- helpers ---------- */

function getCompanyId(): string | null {
  const p = new URLSearchParams(window.location.search);
  return p.get("companyId");
}

function formatCurrency(v: string | number | null) {
  if (v == null) return "-";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(v: string | null) {
  if (!v) return "-";
  return new Date(v).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function stageBadge(label: string) {
  const l = label.toLowerCase();
  const variant =
    l.includes("closed won") ? "default" :
    l.includes("closed lost") ? "destructive" :
    "outline";

  return <Badge variant={variant}>{label}</Badge>;
}

function invoiceStatusBadge(status: string) {
  const map: Record<string, any> = {
    paid: "default",
    open: "secondary",
    draft: "outline",
    voided: "outline",
  };
  return <Badge variant={map[status] ?? "outline"}>{status}</Badge>;
}

function isOverdue(i: Invoice) {
  if (i.hs_invoice_status !== "open" || !i.hs_due_date) return false;
  return new Date(i.hs_due_date) < new Date();
}

/* ---------- pagination ---------- */

function Pagination({ page, pages, set }: any) {
  if (pages <= 1) return null;
  return (
    <div className="flex justify-between pt-4">
      <Button disabled={page === 1} onClick={() => set(page - 1)}>Prev</Button>
      <span>Page {page} / {pages}</span>
      <Button disabled={page === pages} onClick={() => set(page + 1)}>Next</Button>
    </div>
  );
}

/* ---------- tables ---------- */

function DealsTable({ deals, loading, labels }: any) {
  const [q, setQ] = useState("");
  const [p, setP] = useState(1);

  const f = useMemo(() => {
    if (!q) return deals;
    return deals.filter((d: Deal) =>
      d.dealname.toLowerCase().includes(q.toLowerCase())
    );
  }, [deals, q]);

  const pages = Math.ceil(f.length / PAGE_SIZE);
  const data = f.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);

  if (loading) return <Skeleton className="h-32" />;

  return (
    <>
      <Input placeholder="Search deals" value={q} onChange={e => setQ(e.target.value)} />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Stage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d: Deal) => (
            <TableRow key={d.id}>
              <TableCell>{d.dealname}</TableCell>
              <TableCell>{formatCurrency(d.amount)}</TableCell>
              <TableCell>
                {stageBadge(labels?.[d.dealstage] ?? d.dealstage)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination page={p} pages={pages} set={setP} />
    </>
  );
}

/* ---------- page ---------- */

export default function InvoiceManager() {
  const companyId = getCompanyId();
  const [needsConnect, setNeedsConnect] = useState(false);

  const { data: stageLabels } = useQuery({
    queryKey: ["deal-stage-labels"],
    queryFn: async () =>
      (await apiRequest("GET", "/api/pipelines/deals/stages")).json(),
  });

  const { data, isLoading, refetch } = useQuery<CompanyData>({
    queryKey: ["company", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const r = await apiRequest("GET", `/api/company/${companyId}`);
      if (r.status === 401) {
        setNeedsConnect(true);
        return null;
      }
      setNeedsConnect(false);
      return r.json();
    },
  });

  if (!companyId) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Missing companyId</AlertTitle>
        <AlertDescription>Open from HubSpot Company record</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="m-4">
      <CardHeader className="flex justify-between">
        <CardTitle className="flex items-center gap-2">
          <Building2 /> Invoice Manager
        </CardTitle>
        <Button size="icon" onClick={() => refetch()}>
          <RefreshCw />
        </Button>
      </CardHeader>

      <CardContent>
        {needsConnect && (
          <Alert variant="destructive">
            <AlertTitle>Not connected</AlertTitle>
            <AlertDescription>
              <a href="/auth/hubspot" className="underline">
                Connect to HubSpot
              </a>
            </AlertDescription>
          </Alert>
        )}

        {!needsConnect && (
          <>
            <Separator />
            <h3 className="font-semibold mt-4">Deals</h3>
            <DealsTable
              deals={data?.deals ?? []}
              loading={isLoading}
              labels={stageLabels}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
