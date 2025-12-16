import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CompanyData, ArchiveOverdueInvoicesResponse, ArchiveSingleInvoiceResponse, Deal, Invoice } from "@shared/schema";

const DEMO_COMPANY_ID = "demo-company-123";
const PAGE_SIZE = 10;

function formatCurrency(amount: string | null): string {
  if (!amount) return "-";
  const num = parseFloat(amount);
  if (isNaN(num)) return amount;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getDealStageBadge(stage: string) {
  const stageMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    closedwon: { label: "Closed Won", variant: "default" },
    closedlost: { label: "Closed Lost", variant: "destructive" },
    contractsent: { label: "Contract Sent", variant: "secondary" },
    qualifiedtobuy: { label: "Qualified", variant: "outline" },
    appointmentscheduled: { label: "Appointment", variant: "outline" },
    presentationscheduled: { label: "Presentation", variant: "outline" },
    decisionmakerboughtin: { label: "Decision Maker", variant: "secondary" },
  };

  const config = stageMap[stage.toLowerCase()] || { label: stage, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

function getInvoiceStatusBadge(status: string) {
  const statusMap: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    paid: { label: "Paid", variant: "default" },
    pending: { label: "Pending", variant: "secondary" },
    overdue: { label: "Overdue", variant: "destructive" },
    draft: { label: "Draft", variant: "outline" },
    voided: { label: "Voided", variant: "outline" },
  };

  const config = statusMap[status.toLowerCase()] || { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalItems: number;
}

function Pagination({ currentPage, totalPages, onPageChange, totalItems }: PaginationProps) {
  if (totalPages <= 1) return null;
  
  const startItem = (currentPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(currentPage * PAGE_SIZE, totalItems);
  
  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <p className="text-sm text-muted-foreground">
        Showing {startItem}-{endItem} of {totalItems}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          data-testid="button-prev-page"
        >
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="text-sm text-muted-foreground px-2">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          data-testid="button-next-page"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function DealsTable({ deals, isLoading }: { deals: Deal[]; isLoading: boolean }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredDeals = useMemo(() => {
    if (!searchTerm.trim()) return deals;
    const term = searchTerm.toLowerCase();
    return deals.filter(
      (deal) =>
        deal.dealname.toLowerCase().includes(term) ||
        deal.dealstage.toLowerCase().includes(term) ||
        (deal.amount && deal.amount.includes(term))
    );
  }, [deals, searchTerm]);

  const totalPages = Math.ceil(filteredDeals.length / PAGE_SIZE);
  const paginatedDeals = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredDeals.slice(start, start + PAGE_SIZE);
  }, [filteredDeals, currentPage]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full max-w-sm" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search deals..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
          data-testid="input-search-deals"
        />
      </div>

      {filteredDeals.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md">
          <FileText className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>{searchTerm ? "No deals match your search" : "No associated deals found"}</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Deal Name</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Close Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedDeals.map((deal) => (
                  <TableRow key={deal.id} data-testid={`row-deal-${deal.id}`}>
                    <TableCell className="font-medium" data-testid={`text-dealname-${deal.id}`}>
                      {deal.dealname}
                    </TableCell>
                    <TableCell data-testid={`text-amount-${deal.id}`}>
                      {formatCurrency(deal.amount)}
                    </TableCell>
                    <TableCell data-testid={`status-stage-${deal.id}`}>
                      {getDealStageBadge(deal.dealstage)}
                    </TableCell>
                    <TableCell data-testid={`text-closedate-${deal.id}`}>
                      {formatDate(deal.closedate)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredDeals.length}
          />
        </>
      )}
    </div>
  );
}

interface InvoicesTableProps {
  invoices: Invoice[];
  isLoading: boolean;
  onArchiveInvoice: (invoiceId: string) => void;
  archivingInvoiceId: string | null;
  companyBadDebt: boolean;
}

function InvoicesTable({ invoices, isLoading, onArchiveInvoice, archivingInvoiceId, companyBadDebt }: InvoicesTableProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const filteredInvoices = useMemo(() => {
    if (!searchTerm.trim()) return invoices;
    const term = searchTerm.toLowerCase();
    return invoices.filter(
      (invoice) =>
        invoice.hs_invoice_number.toLowerCase().includes(term) ||
        invoice.hs_invoice_status.toLowerCase().includes(term) ||
        (invoice.amount && invoice.amount.includes(term))
    );
  }, [invoices, searchTerm]);

  const totalPages = Math.ceil(filteredInvoices.length / PAGE_SIZE);
  const paginatedInvoices = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredInvoices.slice(start, start + PAGE_SIZE);
  }, [filteredInvoices, currentPage]);

  const handleSearchChange = (value: string) => {
    setSearchTerm(value);
    setCurrentPage(1);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full max-w-sm" />
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search invoices..."
          value={searchTerm}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
          data-testid="input-search-invoices"
        />
      </div>

      {filteredInvoices.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md">
          <DollarSign className="mx-auto h-8 w-8 mb-2 opacity-50" />
          <p>{searchTerm ? "No invoices match your search" : "No associated invoices found"}</p>
        </div>
      ) : (
        <>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedInvoices.map((invoice) => {
                  const isOverdue = invoice.hs_invoice_status.toLowerCase() === "overdue";
                  const isArchiving = archivingInvoiceId === invoice.id;
                  
                  return (
                    <TableRow 
                      key={invoice.id} 
                      data-testid={`row-invoice-${invoice.id}`}
                      className={isOverdue ? "bg-destructive/5" : ""}
                    >
                      <TableCell className="font-medium" data-testid={`text-invoice-number-${invoice.id}`}>
                        {invoice.hs_invoice_number}
                      </TableCell>
                      <TableCell data-testid={`status-invoice-${invoice.id}`}>
                        {getInvoiceStatusBadge(invoice.hs_invoice_status)}
                      </TableCell>
                      <TableCell data-testid={`text-invoice-amount-${invoice.id}`}>
                        {formatCurrency(invoice.amount)}
                      </TableCell>
                      <TableCell>
                        {isOverdue ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => onArchiveInvoice(invoice.id)}
                            disabled={isArchiving || companyBadDebt}
                            data-testid={`button-mark-bad-debt-${invoice.id}`}
                          >
                            {isArchiving ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                Archiving...
                              </>
                            ) : (
                              <>
                                <Trash2 className="h-3 w-3 mr-1" />
                                Mark Bad Debt
                              </>
                            )}
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            totalItems={filteredInvoices.length}
          />
        </>
      )}
    </div>
  );
}

export default function InvoiceManager() {
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [archivingInvoiceId, setArchivingInvoiceId] = useState<string | null>(null);

  const { data: companyData, isLoading, refetch, isRefetching } = useQuery<CompanyData>({
    queryKey: ["/api/company", DEMO_COMPANY_ID],
  });

  const archiveSingleInvoiceMutation = useMutation<ArchiveSingleInvoiceResponse, Error, string>({
    mutationFn: async (invoiceId: string) => {
      setArchivingInvoiceId(invoiceId);
      const response = await apiRequest("POST", `/api/company/${DEMO_COMPANY_ID}/invoice/${invoiceId}/archive`, {});
      return response.json();
    },
    onSuccess: (data) => {
      setErrorMessage(null);
      setArchivingInvoiceId(null);
      setSuccessMessage(`Invoice archived and company marked as bad debt. Hidden from reporting.`);
      queryClient.invalidateQueries({ queryKey: ["/api/company", DEMO_COMPANY_ID] });
      setTimeout(() => setSuccessMessage(null), 8000);
    },
    onError: (error) => {
      setSuccessMessage(null);
      setArchivingInvoiceId(null);
      setErrorMessage(error.message || "Failed to archive invoice.");
      setTimeout(() => setErrorMessage(null), 5000);
    },
  });

  const overdueCount = companyData?.overdueCount || 0;
  const badDebtValue = companyData?.company?.bad_debt === "true";

  const handleArchiveInvoice = (invoiceId: string) => {
    archiveSingleInvoiceMutation.mutate(invoiceId);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full py-6 px-4 md:px-6 lg:px-8">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between gap-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-md">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-xl" data-testid="text-card-title">
                  Invoice Manager
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1" data-testid="text-company-name">
                  {isLoading ? "Loading..." : companyData?.company?.name || "Company Record"}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isRefetching}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>
          </CardHeader>
          
          <CardContent className="space-y-6">
            {badDebtValue && (
              <div className="p-4 bg-destructive/10 rounded-lg">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Bad Debt
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    This company has been marked as bad debt.
                  </span>
                </div>
              </div>
            )}

            {errorMessage && (
              <Alert variant="destructive" data-testid="alert-error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {successMessage && (
              <Alert className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950" data-testid="alert-success">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <AlertTitle className="text-green-800 dark:text-green-200">Success</AlertTitle>
                <AlertDescription className="text-green-700 dark:text-green-300">
                  {successMessage}
                </AlertDescription>
              </Alert>
            )}

            <Separator />

            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2" data-testid="text-deals-header">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Associated Deals
              </h3>
              <DealsTable deals={companyData?.deals || []} isLoading={isLoading} />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <h3 className="text-lg font-semibold flex items-center gap-2" data-testid="text-invoices-header">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  Associated Invoices
                </h3>
                {overdueCount > 0 && (
                  <Badge variant="destructive" data-testid="badge-overdue-count">
                    {overdueCount} Overdue
                  </Badge>
                )}
              </div>
              <InvoicesTable 
                invoices={companyData?.invoices || []} 
                isLoading={isLoading}
                onArchiveInvoice={handleArchiveInvoice}
                archivingInvoiceId={archivingInvoiceId}
                companyBadDebt={badDebtValue}
              />
            </div>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
