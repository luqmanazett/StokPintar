import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Check = {
  id: string;
  label: string;
  passed: boolean;
  checkedCount: number;
  issueCount: number;
  issues: string[];
};
type Result = { checkedAt: string; passed: boolean; checks: Check[] };

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

export default function Integrity() {
  const [result, setResult] = useState<Result | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const runCheck = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const response = await api<Result>("/integrity/check");
      setResult(response);
      if (response.passed) toast.success("Pemeriksaan integritas selesai: semua pemeriksaan lulus.");
      else toast.error("Pemeriksaan menemukan data yang perlu ditinjau.");
    } catch (requestError) {
      const message = (requestError as Error).message;
      setError(message);
      setResult(null);
      toast.error(`Pemeriksaan gagal dijalankan: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  return (
    <div className="space-y-5">
      <PageHeader title="Integritas data" description="Pemeriksaan hanya membaca data dan tidak mengubah isi database." />

      <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-medium text-slate-900">Pemeriksaan konsistensi</p>
            <p className="text-sm text-muted-foreground">
              {result ? `Pemeriksaan terakhir: ${dateFormatter.format(new Date(result.checkedAt))} WIB` : "Periksa saldo stok dan catatan transaksi."}
            </p>
          </div>
        </div>
        <Button onClick={() => void runCheck()} disabled={isLoading}>
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          {isLoading ? "Memeriksa..." : "Jalankan pemeriksaan"}
        </Button>
      </Card>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>Pemeriksaan gagal: {error}</span>
          <Button variant="outline" size="sm" onClick={() => void runCheck()}>Coba lagi</Button>
        </div>
      )}

      <div className="space-y-3">
        {isLoading ? Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />) : result?.checks.map((check) => (
          <Card key={check.id} className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                {check.passed
                  ? <CheckCircle2 className="mt-0.5 size-5 text-emerald-600" aria-hidden="true" />
                  : <CircleAlert className="mt-0.5 size-5 text-red-600" aria-hidden="true" />}
                <div>
                  <h2 className="font-medium text-slate-900">{check.label}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{check.checkedCount.toLocaleString("id-ID")} data diperiksa</p>
                </div>
              </div>
              <Badge variant={check.passed ? "success" : "destructive"}>
                {check.passed ? "Lulus" : `${check.issueCount} masalah`}
              </Badge>
            </div>
            {!check.passed && (
              <ul className="mt-4 space-y-1 border-t pt-3 text-sm text-red-700">
                {check.issues.map((issue, index) => <li key={`${check.id}-${index}`}>{issue}</li>)}
                {check.issueCount > check.issues.length && <li>Masih ada masalah lainnya yang diringkas di hasil CLI.</li>}
              </ul>
            )}
          </Card>
        ))}
        {!isLoading && !error && result?.checks.length === 0 && (
          <Card className="p-5 text-sm text-muted-foreground">Belum ada pemeriksaan yang dapat dijalankan.</Card>
        )}
      </div>
    </div>
  );
}
