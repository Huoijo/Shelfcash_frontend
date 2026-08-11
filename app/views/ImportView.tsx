"use client";

import {
  Check,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useMemo, useRef, useState } from "react";
import {
  applyMappingSuggestion,
  buildEditableMappings,
  canonicalFieldLabel,
  changeSheetMappingType,
  ignoreField,
  isProcessableSheet,
  issueMessages,
  mergeImportFiles,
  resultCounts,
  selectableSheetTypes,
  sheetTypeLabels,
  toConfirmMappings,
  validateImportFiles,
  validateImportMappings,
} from "../../lib/ingestion";
import {
  ShelfCashApiError,
  confirmImport,
  createIdempotencyKey,
  createImport,
  getImport,
  getImportResult,
  mapSheet,
  processImport,
} from "../../lib/shelfcash-client";
import type {
  BackendConnectionHealth,
  EditableSheetMapping,
  ImportCreateResponse,
  IngestionResult,
} from "../../lib/types";
import {
  Button,
  Confidence,
  Notice,
  PageHeader,
  SectionHeading,
  StatCard,
  SummaryGrid,
  cn,
} from "../components/ui";

type Phase =
  | "select"
  | "review"
  | "confirmed"
  | "processing"
  | "failed"
  | "done";

function clampForecastHorizon(value: number): number {
  return Math.min(7, Math.max(1, Number.isFinite(value) ? value : 1));
}

function sourceLabel(source: string): string {
  if (source === "llm") return "AI";
  if (source === "rule_fallback") return "Quy tắc dự phòng";
  return "Quy tắc";
}

function resultRowLabel(label: string): string {
  const labels: Record<string, string> = {
    "Tồn kho": "Dòng tồn kho",
    "Bán / tiêu thụ": "Dòng bán / tiêu thụ",
    "Công thức": "Dòng công thức",
    "Nhập hàng": "Dòng nhập hàng",
    Menu: "Dòng menu",
  };
  return labels[label] ?? `Số dòng ${label.toLocaleLowerCase("vi")}`;
}

function errorState(caught: unknown): { message: string } {
  if (caught instanceof ShelfCashApiError) {
    return {
      message: caught.message || "Không thể hoàn tất thao tác.",
    };
  }
  return {
    message:
      caught instanceof Error
        ? caught.message
        : "Không thể hoàn tất thao tác.",
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function retryableTransportFailure(caught: unknown): boolean {
  return (
    caught instanceof ShelfCashApiError &&
    ["NETWORK_ERROR", "BACKEND_UNREACHABLE", "REQUEST_TIMEOUT"].includes(
      caught.code,
    )
  );
}

function importStillProcessing(caught: unknown): boolean {
  return (
    caught instanceof ShelfCashApiError &&
    (caught.status === 409 ||
      caught.status === 425 ||
      ["IMPORT_NOT_READY", "IMPORT_PROCESSING"].includes(caught.code))
  );
}

function normalizedImportStatus(status: unknown): string {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

function importStatusLabel(status: unknown): string {
  const normalized = normalizedImportStatus(status);
  if (normalized === "confirmed") return "Đã xác nhận ghép cột";
  if (["processing", "running"].includes(normalized)) return "Đang xử lý";
  if (["queued", "pending"].includes(normalized)) return "Đang chờ xử lý";
  if (
    ["processed", "completed", "done", "succeeded", "success"].includes(
      normalized,
    )
  ) {
    return "Đã hoàn tất";
  }
  if (normalized === "failed") return "Không thành công";
  return "Chưa xác định";
}

export function ImportView({
  defaultStoreId,
  defaultForecastDate,
  defaultForecastHorizon,
  connection,
  files,
  setFiles,
  onRefreshConnection,
  onImported,
}: {
  store?: string;
  defaultStoreId: string;
  defaultForecastDate: string;
  defaultForecastHorizon: number;
  connection: BackendConnectionHealth | null;
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
  onRefreshConnection: () => Promise<void>;
  onImported: (result: IngestionResult, files: File[]) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const actionInFlight = useRef<string | null>(null);
  const idempotency = useRef<{
    upload?: { fingerprint: string; key: string };
    confirm?: { fingerprint: string; key: string };
    process?: { importId: string; key: string };
  }>({});
  const [storeId, setStoreId] = useState(defaultStoreId);
  const [forecastDate, setForecastDate] = useState(defaultForecastDate);
  const [forecastHorizon, setForecastHorizon] = useState(() =>
    clampForecastHorizon(defaultForecastHorizon),
  );
  const [phase, setPhase] = useState<Phase>("select");
  const [created, setCreated] = useState<ImportCreateResponse | null>(null);
  const [mappings, setMappings] = useState<EditableSheetMapping[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState("");
  const [checked, setChecked] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; code?: string } | null>(
    null,
  );
  const [result, setResult] = useState<IngestionResult | null>(null);

  const selected =
    mappings.find((item) => item.id === selectedId) ?? mappings[0];
  const activeStep =
    phase === "select"
      ? 0
      : phase === "review"
        ? 1
        : phase === "confirmed"
          ? 2
          : phase === "processing" || phase === "failed"
            ? 2
            : 3;
  const mappingValidation = useMemo(
    () => validateImportMappings(mappings),
    [mappings],
  );
  const validationBySheetId = useMemo(
    () =>
      new Map(
        mappingValidation.sheets.map((validation) => [
          validation.sheetId,
          validation,
        ]),
      ),
    [mappingValidation.sheets],
  );
  const selectedValidation = selected
    ? validationBySheetId.get(selected.id)
    : undefined;
  const usedTargetFields = useMemo(() => {
    if (!selected) return new Map<string, string>();
    return new Map(
      selected.columns
        .map((column) => [selected.mapping[column], column] as const)
        .filter(
          ([field]) =>
            Boolean(field) &&
            field !== ignoreField &&
            selected.targetFields.includes(field),
        ),
    );
  }, [selected]);

  function beginAction(action: string): boolean {
    if (actionInFlight.current) return false;
    actionInFlight.current = action;
    setBusy(action);
    return true;
  }

  function finishAction(action: string) {
    if (actionInFlight.current === action) actionInFlight.current = null;
    setBusy("");
  }

  function addFiles(nextFiles: FileList | File[]) {
    const selection = mergeImportFiles(files, nextFiles);
    setFiles(selection.files);
    setError(
      selection.errors.length
        ? { message: selection.errors.join(" ") }
        : null,
    );
    setResult(null);
    setPhase("select");
  }

  function resetImport() {
    idempotency.current = {};
    setCreated(null);
    setMappings([]);
    setSelectedId("");
    setPhase("select");
    setChecked(false);
    setWarnings([]);
    setErrors([]);
    setError(null);
    setResult(null);
    setStatusText("");
  }

  async function startImport() {
    if (!files.length || !storeId.trim()) return;
    const fileErrors = validateImportFiles(files);
    if (fileErrors.length) {
      setError({ message: fileErrors.join(" ") });
      return;
    }
    if (!beginAction("upload")) return;
    setError(null);
    setWarnings([]);
    setErrors([]);
    const fingerprint = JSON.stringify({
      storeId: storeId.trim(),
      forecastDate,
      forecastHorizon,
      files: files.map((file) => ({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      })),
    });
    if (idempotency.current.upload?.fingerprint !== fingerprint) {
      idempotency.current.upload = {
        fingerprint,
        key: createIdempotencyKey(),
      };
    }
    try {
      const response = await createImport({
        files,
        storeId: storeId.trim(),
        forecastDate: forecastDate || undefined,
        forecastHorizon,
        idempotencyKey: idempotency.current.upload.key,
      });
      if (!response.import_id) {
        throw new Error("Hệ thống không tạo được mã lần nhập.");
      }
      const editable = buildEditableMappings(response);
      setCreated(response);
      setMappings(editable);
      setSelectedId(editable[0]?.id ?? "");
      setWarnings(issueMessages(response.warnings));
      setErrors(issueMessages(response.errors));
      setPhase("review");
      setStatusText(
        response.requires_review === false
          ? "Hệ thống đã nhận diện đầy đủ. Bạn vẫn có thể kiểm tra trước khi xử lý."
          : "Kiểm tra loại dữ liệu và cách ghép cột.",
      );
      delete idempotency.current.upload;
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        delete idempotency.current.upload;
      }
      setError(errorState(caught));
    } finally {
      finishAction("upload");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function updateSelected(
    updater: (item: EditableSheetMapping) => EditableSheetMapping,
  ) {
    if (!selected) return;
    setMappings((current) =>
      current.map((item) => (item.id === selected.id ? updater(item) : item)),
    );
    setChecked(false);
    setError(null);
  }

  async function remapWithQwen() {
    if (!selected || !isProcessableSheet(selected)) return;
    if (!beginAction("llm")) return;
    setError(null);
    try {
      const suggestion = await mapSheet(selected.profile);
      updateSelected((item) => applyMappingSuggestion(item, suggestion));
      setStatusText(
        `Đã cập nhật gợi ý ghép cột cho “${selected.sheetName}”.`,
      );
    } catch (caught) {
      setError(errorState(caught));
    } finally {
      finishAction("llm");
    }
  }

  async function refreshStatus() {
    if (!created?.import_id) return;
    if (!beginAction("status")) return;
    setError(null);
    try {
      const response = await getImport(created.import_id);
      setWarnings(issueMessages(response.warnings));
      setErrors(issueMessages(response.errors));
      const backendStatus = normalizedImportStatus(response.status);
      if (backendStatus === "failed") {
        setPhase("failed");
        delete idempotency.current.process;
        setStatusText(
          "Lần nhập này không thành công. Hãy tạo lần nhập mới với các tệp đang được giữ.",
        );
        return;
      }
      if (
        ["processed", "completed", "done", "succeeded", "success"].includes(
          backendStatus,
        )
      ) {
        try {
          const payload = await getImportResult(created.import_id);
          await completeImport(payload, phase !== "done" || result === null);
        } catch (caught) {
          if (!importStillProcessing(caught)) throw caught;
          setPhase("processing");
          setStatusText(
            "Dữ liệu đã xử lý xong nhưng kết quả chưa sẵn sàng. Chọn Đồng bộ lại sau một lúc.",
          );
        }
        return;
      }
      if (backendStatus === "confirmed") {
        setPhase("confirmed");
      } else if (
        ["processing", "running", "queued", "pending"].includes(backendStatus)
      ) {
        setPhase("processing");
      }
      setStatusText(
        response.status
          ? `Trạng thái xử lý: ${importStatusLabel(response.status)}`
          : "Đã đồng bộ trạng thái mới nhất.",
      );
    } catch (caught) {
      setError(errorState(caught));
    } finally {
      finishAction("status");
    }
  }

  async function completeImport(
    payload: IngestionResult,
    synchronize: boolean,
  ) {
    delete idempotency.current.process;
    setResult(payload);
    setPhase("done");
    setStatusText("Dữ liệu đã được nhập vào ShelfCash.");
    if (!synchronize) return;
    try {
      await onImported(payload, files);
    } catch (caught) {
      setError({
        message: `${errorState(caught).message} Dữ liệu đã được xử lý; hãy đồng bộ lại.`,
      });
    }
  }

  async function confirmMappings() {
    if (!created?.import_id) return;
    if (!mappingValidation.complete) {
      const firstIncomplete = mappingValidation.sheets.find(
        (sheet) => !sheet.unknownSheetType && !sheet.complete,
      );
      if (firstIncomplete) setSelectedId(firstIncomplete.sheetId);
      setChecked(false);
      setStatusText("Hoàn tất các trường bắt buộc trước khi xác nhận.");
      setError({
        message:
          "Chưa thể tiếp tục. Hãy ghép đủ các trường bắt buộc và gỡ trường chuẩn bị trùng.",
      });
      return;
    }
    if (!beginAction("confirm")) return;
    setError(null);
    const confirmPayload = toConfirmMappings(mappings);
    const fingerprint = JSON.stringify({
      importId: created.import_id,
      mappings: confirmPayload,
    });
    if (idempotency.current.confirm?.fingerprint !== fingerprint) {
      idempotency.current.confirm = {
        fingerprint,
        key: createIdempotencyKey(),
      };
    }
    try {
      const response = await confirmImport(
        created.import_id,
        confirmPayload,
        { idempotencyKey: idempotency.current.confirm.key },
      );
      const nextWarnings = issueMessages(response.warnings);
      const nextErrors = issueMessages(response.errors);
      setWarnings(nextWarnings);
      setErrors(nextErrors);
      if (nextErrors.length) {
        setStatusText("Hệ thống yêu cầu kiểm tra lại cách ghép cột.");
        return;
      }
      setPhase("confirmed");
      setStatusText("Đã xác nhận cách ghép cột.");
      delete idempotency.current.confirm;
    } catch (caught) {
      if (!retryableTransportFailure(caught)) {
        delete idempotency.current.confirm;
      }
      setError(errorState(caught));
    } finally {
      finishAction("confirm");
    }
  }

  async function waitForResult(importId: string): Promise<IngestionResult> {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      try {
        return await getImportResult(importId);
      } catch (caught) {
        if (!importStillProcessing(caught) || attempt === 11) throw caught;
        await delay(800);
      }
    }
    throw new Error("Kết quả chưa sẵn sàng.");
  }

  async function runProcess() {
    if (!created?.import_id || phase !== "confirmed") return;
    if (!beginAction("process")) return;
    setError(null);
    setPhase("processing");
    setStatusText("Đang chuẩn hóa và kiểm tra dữ liệu…");
    if (idempotency.current.process?.importId !== created.import_id) {
      idempotency.current.process = {
        importId: created.import_id,
        key: createIdempotencyKey(),
      };
    }
    try {
      const response = await processImport(created.import_id, {
        idempotencyKey: idempotency.current.process.key,
      });
      const nextErrors = issueMessages(response.errors);
      setWarnings(issueMessages(response.warnings));
      setErrors(nextErrors);
      if (normalizedImportStatus(response.status) === "failed") {
        setPhase("failed");
        setStatusText(
          "Lần nhập này không thành công. Hãy tạo lần nhập mới với các tệp đang được giữ.",
        );
        delete idempotency.current.process;
        return;
      }
      const payload = await waitForResult(created.import_id);
      await completeImport(payload, true);
    } catch (caught) {
      const stillProcessing = importStillProcessing(caught);
      setPhase("processing");
      setStatusText(
        "Dữ liệu có thể vẫn đang được xử lý. Không cần gửi lại; chọn Đồng bộ để kiểm tra trạng thái.",
      );
      setError(stillProcessing ? null : errorState(caught));
    } finally {
      finishAction("process");
    }
  }

  return (
    <>
      <PageHeader title="Nhập dữ liệu" />

      {connection?.service !== "online" ? (
        <div className="connection-strip">
          <div>
            <i className="connection-dot" />
            <span>
              Máy chủ{" "}
              <strong>{connection ? "chưa kết nối" : "đang kiểm tra"}</strong>
            </span>
          </div>
          <Button
            variant="quiet"
            busy={busy === "health"}
            onClick={() => void onRefreshConnection()}
          >
            <RefreshCw size={14} />
            Kiểm tra lại
          </Button>
        </div>
      ) : null}

      {connection?.service === "offline" ? (
        <Notice tone="warning">
          Không thể kết nối máy chủ. Hãy thử lại trước khi tải tệp.
        </Notice>
      ) : null}

      <ol className="step-track" aria-label="Tiến trình nhập dữ liệu">
        {["Chọn tệp", "Ghép cột", "Xử lý", "Hoàn tất"].map(
          (step, index) => (
            <li className={index <= activeStep ? "active" : ""} key={step}>
              <i>{index < activeStep ? <Check size={12} /> : index + 1}</i>
              <span>{step}</span>
            </li>
          ),
        )}
      </ol>

      {phase === "select" ? (
        <>
          <div className="import-config">
            <label className="field">
              <span>Mã cửa hàng</span>
              <input
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                placeholder="STORE_001"
              />
            </label>
            <label className="field">
              <span>Ngày dự báo</span>
              <input
                type="date"
                value={forecastDate}
                onChange={(event) => setForecastDate(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Số ngày dự báo</span>
              <input
                type="number"
                min={1}
                max={7}
                value={forecastHorizon}
                onChange={(event) =>
                  setForecastHorizon(
                    clampForecastHorizon(Number(event.target.value) || 1),
                  )
                }
              />
            </label>
          </div>

          <div className="import-top">
            <button
              className={cn("dropzone", busy === "upload" && "dropzone-busy")}
              disabled={Boolean(busy)}
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                addFiles(event.dataTransfer.files);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.xlsm,.csv"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files) addFiles(event.target.files);
                }}
              />
              <UploadCloud size={21} />
              <span>
                <strong>Chọn hoặc thả tệp Excel, CSV</strong>
              </span>
            </button>
            <div className="sample-file">
              <FileSpreadsheet size={20} />
              <span>
                <strong>Tệp mẫu</strong>
              </span>
              <a href="/api/sample" download>
                <Download size={16} />
                Tải Excel mẫu
              </a>
            </div>
          </div>

          {files.length ? (
            <>
              <div className="file-list">
                {files.map((file) => (
                  <div key={`${file.name}:${file.lastModified}`}>
                    <FileSpreadsheet size={15} />
                    <span>
                      <strong>{file.name}</strong>
                      <small>{(file.size / 1024).toFixed(0)} KB</small>
                    </span>
                    <button
                      aria-label={`Bỏ ${file.name}`}
                      onClick={() =>
                        setFiles((current) =>
                          current.filter((item) => item !== file),
                        )
                      }
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          <div className="confirm-row">
            <Button
              variant="primary"
              busy={busy === "upload"}
              disabled={
                Boolean(busy) ||
                !files.length ||
                !storeId.trim() ||
                connection?.service === "offline"
              }
              onClick={() => void startImport()}
            >
              Tải lên và nhận diện cột
            </Button>
          </div>
        </>
      ) : null}

      {error ? (
        <Notice tone="error">{error.message}</Notice>
      ) : null}
      {warnings.map((warning) => (
        <Notice tone="warning" key={warning}>
          {warning}
        </Notice>
      ))}
      {errors.map((item) => (
        <Notice tone="error" key={item}>
          {item}
        </Notice>
      ))}

      {phase !== "select" && created ? (
        <>
          <div className="import-meta">
            <span>
              Mã lần nhập <strong>{created.import_id.slice(0, 8)}</strong>
            </span>
            <span>
              Nguồn đề xuất{" "}
              <strong>{sourceLabel(created.source ?? "rule")}</strong>
            </span>
            <Button
              variant="quiet"
              busy={busy === "status"}
              onClick={() => void refreshStatus()}
            >
              <RefreshCw size={13} />
              Đồng bộ
            </Button>
          </div>

          {statusText ? <p className="quiet-help">{statusText}</p> : null}
        </>
      ) : null}

      {(phase === "review" || phase === "confirmed") && selected ? (
        <>
          <SectionHeading
            title="Các bảng dữ liệu"
            action={
              <Button
                variant="secondary"
                busy={busy === "llm"}
                disabled={
                  Boolean(busy) ||
                  connection?.service === "offline" ||
                  selectedValidation?.unknownSheetType
                }
                title={
                  selectedValidation?.unknownSheetType
                    ? "Bảng chưa xác định sẽ được bỏ qua; không cần gợi ý lại"
                    : undefined
                }
                onClick={() => void remapWithQwen()}
              >
                <Sparkles size={14} />
                Gợi ý lại bằng AI
              </Button>
            }
          />
          <div className="sheet-grid">
            {mappings.map((item) => {
              const validation = validationBySheetId.get(item.id);
              return (
                <button
                  className={cn(
                    "sheet-card",
                    item.id === selected.id && "active",
                    validation?.unknownSheetType
                      ? "skipped"
                      : validation?.complete
                        ? "complete"
                        : "needs-review",
                  )}
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                >
                  <span>
                    <strong>{item.sheetName}</strong>
                    <small>
                      {item.fileName || "Tệp đã tải"} ·{" "}
                      {item.rowCount.toLocaleString("vi-VN")} dòng
                    </small>
                  </span>
                  <span className="sheet-card-meta">
                    <em>
                      {sheetTypeLabels[
                        item.sheetType as keyof typeof sheetTypeLabels
                      ] ?? item.sheetType}
                    </em>
                    <b
                      className={cn(
                        "mapping-state",
                        validation?.unknownSheetType
                          ? "skipped"
                          : validation?.fullyMapped
                            ? "complete"
                            : "pending",
                      )}
                    >
                      {validation?.unknownSheetType
                        ? "Bỏ qua"
                        : validation?.fullyMapped
                        ? "Đã ghép đủ"
                        : `${validation?.mappedColumns ?? 0}/${validation?.totalColumns ?? item.columns.length} cột`}
                    </b>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="two-column compact-gap">
            <label className="field">
              <span>Loại dữ liệu</span>
              <select
                value={selected.sheetType}
                disabled={phase === "confirmed"}
                onChange={(event) =>
                  updateSelected((item) =>
                    changeSheetMappingType(item, event.target.value),
                  )
                }
              >
                {selectableSheetTypes.map((type) => (
                  <option value={type} key={type}>
                    {sheetTypeLabels[type]}
                  </option>
                ))}
              </select>
            </label>
            <Confidence
              title={
                selected.confidence === null
                  ? "Chưa có điểm tin cậy"
                  : `Độ tin cậy ${Math.round(
                      selected.confidence <= 1
                        ? selected.confidence * 100
                        : selected.confidence,
                    )}%`
              }
              detail={`Nguồn đề xuất: ${sourceLabel(selected.source)}.`}
            />
          </div>

          {selectedValidation?.unknownSheetType ? (
            <Notice tone="info">
              Bảng này chưa xác định được loại dữ liệu và sẽ được bỏ qua.
            </Notice>
          ) : null}

          {!selectedValidation?.unknownSheetType ? (
            <>
              <SectionHeading title="Ghép cột" />
              {selectedValidation?.unresolvedColumns.length ? (
                <Notice tone="info">
                  Có {selectedValidation.unresolvedColumns.length} cột không được
                  nhập:{" "}
                  <strong>
                    {selectedValidation.unresolvedColumns.join(", ")}
                  </strong>
                  .
                </Notice>
              ) : null}
              {selectedValidation?.missingCoreFields.length ? (
                <Notice tone="error">
                  Thiếu trường bắt buộc:{" "}
                  <strong>
                    {selectedValidation.missingCoreFields
                      .map(canonicalFieldLabel)
                      .join(", ")}
                  </strong>
                  . Hãy ghép một cột nguồn với từng trường này.
                </Notice>
              ) : null}
              {selectedValidation?.duplicateFields.length ? (
                <Notice tone="error">
                  Mỗi trường chuẩn chỉ được dùng một lần. Các trường đang bị
                  trùng:{" "}
                  <strong>
                    {selectedValidation.duplicateFields
                      .map(canonicalFieldLabel)
                      .join(", ")}
                  </strong>
                  .
                </Notice>
              ) : null}
              {selectedValidation?.fullyMapped ? (
                <Notice tone="success">
                  Tất cả cột của bảng này đã được ghép hợp lệ.
                </Notice>
              ) : null}
              <div className="mapping-grid">
                {selected.columns.map((column) => {
                  const selectedField =
                    selected.mapping[column] ?? ignoreField;
                  const unresolved =
                    selectedField === ignoreField ||
                    !selected.targetFields.includes(selectedField);
                  return (
                    <label
                      className={cn(
                        "field",
                        "mapping-field",
                        unresolved && "mapping-field-unresolved",
                      )}
                      key={column}
                    >
                      <span>
                        {column}
                        {unresolved ? <b>Không nhập</b> : null}
                      </span>
                      <select
                        value={selectedField}
                        disabled={phase === "confirmed"}
                        aria-invalid={unresolved}
                        onChange={(event) =>
                          updateSelected((item) => ({
                            ...item,
                            mapping: {
                              ...item.mapping,
                              [column]: event.target.value,
                            },
                          }))
                        }
                      >
                        <option value={ignoreField}>
                          Không nhập cột này
                        </option>
                        {selected.targetFields.map((field) => (
                          <option
                            value={field}
                            key={field}
                            disabled={
                              usedTargetFields.has(field) &&
                              usedTargetFields.get(field) !== column
                            }
                          >
                            {canonicalFieldLabel(field)}
                          </option>
                        ))}
                      </select>
                      <small>
                        {unresolved
                          ? "Cột này sẽ không được nhập."
                          : `Đã ghép với ${canonicalFieldLabel(selectedField)}.`}
                      </small>
                    </label>
                  );
                })}
              </div>

              {selected.sampleRows.length ? (
                <>
                  <SectionHeading
                    title="Xem trước"
                  />
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          {selected.columns.slice(0, 6).map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {selected.sampleRows.slice(0, 5).map((row, index) => (
                          <tr key={index}>
                            {selected.columns.slice(0, 6).map((column) => (
                              <td key={column}>{String(row[column] ?? "—")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          ) : null}

          {phase === "review" ? (
            <>
              {mappingValidation.processableSheets === 0 ? (
                <Notice tone="info">
                  Tất cả bảng đều đang ở loại “Chưa xác định” và sẽ được bỏ qua.
                  Lần nhập này sẽ không thêm dữ liệu.
                </Notice>
              ) : (
                <div
                  className={cn(
                    "mapping-progress",
                    mappingValidation.fullyMapped && "complete",
                  )}
                  role="status"
                >
                  <span>
                    <strong>
                      {mappingValidation.mappedColumns}/
                      {mappingValidation.totalColumns} cột đã ghép
                    </strong>
                    <small>
                      {mappingValidation.fullyMapped
                        ? "Tất cả cột đã được ghép."
                        : mappingValidation.complete
                          ? `Đủ trường bắt buộc; còn ${mappingValidation.unresolvedColumns} cột chưa ghép.`
                        : `Còn ${mappingValidation.incompleteSheets} bảng dữ liệu cần hoàn tất.`}
                    </small>
                  </span>
                  <progress
                    max={Math.max(mappingValidation.totalColumns, 1)}
                    value={mappingValidation.mappedColumns}
                  />
                </div>
              )}
              <div className="confirm-row">
                {mappings.length > 0 ? (
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!mappingValidation.complete}
                      onChange={(event) => setChecked(event.target.checked)}
                    />
                    <span>
                      {mappingValidation.complete
                        ? "Tôi đã kiểm tra loại dữ liệu, các trường bắt buộc và những bảng sẽ bỏ qua."
                        : "Bổ sung trường bắt buộc và gỡ phần ghép trùng để mở khóa xác nhận."}
                    </span>
                  </label>
                ) : (
                  <span className="quiet-copy">
                    Chưa có bảng nào để xác nhận.
                  </span>
                )}
                <Button
                  variant="primary"
                  busy={busy === "confirm"}
                  disabled={
                    Boolean(busy) ||
                    !checked ||
                    !mappingValidation.complete ||
                    Boolean(errors.length)
                  }
                  title={
                    mappingValidation.complete
                      ? undefined
                      : "Cần đủ trường bắt buộc và không được trùng trường chuẩn"
                  }
                  onClick={() => void confirmMappings()}
                >
                  Xác nhận ghép cột
                </Button>
              </div>
            </>
          ) : (
            <div className="confirm-row">
              <Button
                variant="quiet"
                disabled={Boolean(busy)}
                onClick={() => setPhase("review")}
              >
                Sửa ghép cột
              </Button>
              <Button
                variant="primary"
                busy={busy === "process"}
                disabled={Boolean(busy) || phase !== "confirmed"}
                onClick={() => void runProcess()}
              >
                Xử lý dữ liệu
              </Button>
            </div>
          )}
        </>
      ) : null}

      {phase === "processing" ? (
        <div className="processing-panel">
          <RefreshCw className="spin" size={20} />
          <span>
            <strong>Đang xử lý dữ liệu</strong>
            <small>
              Bạn có thể chuyển sang mục khác; tiến trình vẫn được giữ trong
              phiên này.
            </small>
          </span>
        </div>
      ) : null}

      {phase === "failed" ? (
        <>
          <Notice tone="error">
            Lần nhập này không thành công và không thể xử lý lại. Các tệp bạn
            chọn vẫn được giữ để tạo một lần nhập mới.
          </Notice>
          <div className="confirm-row">
            <Button
              variant="primary"
              disabled={Boolean(busy)}
              onClick={resetImport}
            >
              Tạo lần nhập mới
            </Button>
          </div>
        </>
      ) : null}

      {phase === "done" && result ? (
        <>
          <Notice tone="success">Nhập dữ liệu hoàn tất.</Notice>
          <SummaryGrid columns={5}>
            {resultCounts(result).map((item) => (
              <StatCard
                key={item.label}
                label={resultRowLabel(item.label)}
                value={item.value.toLocaleString("vi-VN")}
                status="success"
              />
            ))}
          </SummaryGrid>
          <div className="confirm-row">
            <Button
              variant="secondary"
              onClick={() => {
                resetImport();
                setFiles([]);
              }}
            >
              Nhập đợt khác
            </Button>
          </div>
        </>
      ) : null}
    </>
  );
}
