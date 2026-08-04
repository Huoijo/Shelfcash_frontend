"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { buildProcurementSettingsRows } from "../../lib/procurement-settings";
import type {
  Alias,
  BootstrapData,
  CalendarDay,
  ImportLog,
  InventoryConstraint,
  SupplierConstraintRow,
  RecipeVersion,
  Settings,
} from "../../lib/types";
import {
  Button,
  Notice,
  PageHeader,
  SectionHeading,
  TabList,
  formatDate,
  formatVnd,
} from "../components/ui";

const tabs = [
  "Nhà cung cấp",
  "Ngưỡng tồn kho",
  "Tên thay thế",
  "Ngân sách & lịch",
  "Lịch sử",
] as const;

export function SettingsView({
  data,
  importLogs,
  recipeVersions,
  onSaveInventory,
  onSaveAliases,
  onSaveContext,
  inventoryConstraints,
  inventoryConstraintsError,
  inventoryConstraintsLoading,
  initialTab = "Nhà cung cấp",
}: {
  data: BootstrapData;
  importLogs: ImportLog[];
  recipeVersions: RecipeVersion[];
  onSaveInventory: (items: SupplierConstraintRow[]) => Promise<boolean>;
  onSaveAliases: (aliases: Alias[]) => Promise<boolean>;
  onSaveContext: (
    settings: Settings,
    calendar: CalendarDay[],
  ) => Promise<boolean>;
  inventoryConstraints: InventoryConstraint[];
  inventoryConstraintsError: string | null;
  inventoryConstraintsLoading: boolean;
  initialTab?: (typeof tabs)[number];
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]>(initialTab);
  const [supplierTerms, setSupplierTerms] = useState(
    data.supplierConstraints.map((item) => ({ ...item })),
  );
  const [aliases, setAliases] = useState(data.aliases.map((alias) => ({ ...alias })));
  const [settings, setSettings] = useState({ ...data.settings });
  const [calendar, setCalendar] = useState(
    data.futureCalendar.map((day) => ({ ...day })),
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState("");
  const procurementRows = useMemo(
    () => buildProcurementSettingsRows(data.supplierConstraints, inventoryConstraints, data.today),
    [data.supplierConstraints, data.today, inventoryConstraints],
  );

  useEffect(() => {
    setSupplierTerms(data.supplierConstraints.map((item) => ({ ...item })));
    setAliases(data.aliases.map((alias) => ({ ...alias })));
    setSettings({ ...data.settings });
    setCalendar(data.futureCalendar.map((day) => ({ ...day })));
  }, [data]);

  function updateSupplierTerm(index: number, patch: Partial<SupplierConstraintRow>) {
    setSupplierTerms((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setMessage("");
  }

  return (
    <>
      <PageHeader
        title="Cài đặt"
        subtitle="Nhà cung cấp, ngân sách và các quy tắc nhập hàng."
        context={data.settings.storeName}
      />
      <TabList items={tabs} value={tab} onChange={setTab} />
      {message ? <Notice tone="success">{message}</Notice> : null}

      {tab === "Nhà cung cấp" ? (
        <>
          <SectionHeading
            title="Quy tắc theo nguyên liệu"
            subtitle="Các giá trị này được dùng khi lập kế hoạch nhập."
          />
          <div className="table-wrap settings-table">
            <table>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th>Đơn giá</th>
                  <th>Nhà cung cấp</th>
                  <th>Lead time</th>
                  <th>MOQ</th>
                  <th>Quy cách</th>
                  <th>Đơn vị đặt</th>
                  <th>Đơn vị cơ sở</th>
                  <th>Ngày hiệu lực</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {supplierTerms.map((item, index) => (
                  <tr key={item.constraintId ?? `${item.ingredientId}-${item.supplierId}-${index}`}>
                    <td>
                      <strong>{item.ingredient}</strong>
                      <small>{item.orderUnit ?? item.baseUnit ?? "—"}</small>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.unitCost}
                        min="0"
                        step="1000"
                        aria-label={`Đơn giá ${item.ingredient}`}
                        onChange={(event) =>
                          updateSupplierTerm(index, {
                            unitCost: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={item.supplier}
                        aria-label={`Nhà cung cấp ${item.ingredient}`}
                        onChange={(event) =>
                          updateSupplierTerm(index, {
                            supplier: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.leadTimeDays}
                        min="0"
                        step="1"
                        aria-label={`Lead time ${item.ingredient}`}
                        onChange={(event) =>
                          updateSupplierTerm(index, {
                            leadTimeDays: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.moq}
                        min="0"
                        step="0.5"
                        aria-label={`MOQ ${item.ingredient}`}
                        onChange={(event) =>
                          updateSupplierTerm(index, {
                            moq: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.packSize}
                        min="0.01"
                        step="0.5"
                        aria-label={`Quy cách ${item.ingredient}`}
                        onChange={(event) =>
                          updateSupplierTerm(index, {
                            packSize: Number(event.target.value),
                          })
                        }
                      />
                    </td>
                    <td>{item.orderUnit ?? "—"}</td>
                    <td>{item.baseUnit ?? "—"}</td>
                    <td>{item.effectiveDate ? formatDate(item.effectiveDate) : "—"}</td>
                    <td>{item.active === false ? "Ngừng hiệu lực" : "Đang hiệu lực"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="settings-action">
            <Button
              variant="primary"
              busy={saving === "suppliers"}
              onClick={() => {
                void (async () => {
                  setSaving("suppliers");
                  try {
                    if (await onSaveInventory(supplierTerms)) {
                      setMessage("Đã lưu quy tắc nhập hàng.");
                    }
                  } finally {
                    setSaving("");
                  }
                })();
              }}
            >
              <Save size={16} />
              Lưu thay đổi
            </Button>
          </div>
        </>
      ) : null}

      {tab === "Ngưỡng tồn kho" ? (
        <>
          <SectionHeading
            title="Ngưỡng tồn kho"
            subtitle="Safety stock và maximum stock là chính sách tồn kho, độc lập với điều kiện nhà cung cấp."
          />
          {inventoryConstraintsLoading ? (
            <p className="quiet-help">Đang tải ngưỡng tồn kho...</p>
          ) : inventoryConstraintsError ? (
            <Notice tone="error">{inventoryConstraintsError}</Notice>
          ) : procurementRows.length === 0 ? (
            <p className="quiet-help">Chưa cấu hình ngưỡng tồn kho.</p>
          ) : (
            <div className="table-wrap settings-table">
              <table>
                <thead><tr><th>Nguyên liệu</th><th>Safety stock</th><th>Maximum stock</th><th>Ngày hiệu lực</th><th>Version</th><th>Trạng thái</th></tr></thead>
                <tbody>
                  {procurementRows.map((row) => (
                    <tr key={row.ingredientId}>
                      <td>{row.ingredientName}</td>
                      <td>{row.safetyStock ? `${row.safetyStock.value} ${row.safetyStock.unit ?? ""}`.trim() : "Chưa cấu hình"}</td>
                      <td>{row.maximumStock ? `${row.maximumStock.value} ${row.maximumStock.unit ?? ""}`.trim() : "Chưa cấu hình"}</td>
                      <td>{row.safetyStock?.effectiveDate ? formatDate(row.safetyStock.effectiveDate) : "—"}</td>
                      <td>{row.safetyStock?.version ?? row.maximumStock?.version ?? "—"}</td><td>{row.safetyStock || row.maximumStock ? "Đang hiệu lực" : "Chưa cấu hình"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="quiet-help">Dữ liệu chỉ đọc; cập nhật qua import Business Rules / Điều kiện vận hành.</p>
        </>
      ) : null}

      {tab === "Tên thay thế" ? (
        <>
          <SectionHeading
            title="Tên thay thế"
            subtitle="Gộp các cách viết khác nhau về cùng một nguyên liệu."
          />
          <div className="alias-editor">
            {aliases.map((alias, index) => (
              <div className="alias-row" key={`${alias.sourceName}-${index}`}>
                <input
                  value={alias.sourceName}
                  placeholder="Tên trong Excel"
                  aria-label={`Tên thay thế ${index + 1}`}
                  onChange={(event) =>
                    setAliases((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, sourceName: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
                <span>→</span>
                <select
                  value={alias.canonicalName}
                  aria-label={`Nguyên liệu chuẩn ${index + 1}`}
                  onChange={(event) =>
                    setAliases((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, canonicalName: event.target.value }
                          : item,
                      ),
                    )
                  }
                >
                  {data.inventory.map((item) => (
                    <option value={item.ingredient} key={item.ingredient}>
                      {item.ingredient}
                    </option>
                  ))}
                </select>
                <button
                  className="icon-button"
                  aria-label={`Xóa tên thay thế ${index + 1}`}
                  onClick={() =>
                    setAliases((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <Button
              variant="quiet"
              onClick={() =>
                setAliases((current) => [
                  ...current,
                  {
                    sourceName: "",
                    canonicalName: data.inventory[0]?.ingredient ?? "",
                  },
                ])
              }
            >
              <Plus size={15} />
              Thêm tên
            </Button>
          </div>
          <div className="settings-action">
            <Button
              variant="primary"
              busy={saving === "aliases"}
              disabled={aliases.some(
                (alias) => !alias.sourceName || !alias.canonicalName,
              )}
              onClick={() => {
                void (async () => {
                  setSaving("aliases");
                  try {
                    if (await onSaveAliases(aliases)) {
                      setMessage("Đã lưu danh sách tên thay thế.");
                    }
                  } finally {
                    setSaving("");
                  }
                })();
              }}
            >
              <Save size={16} />
              Lưu tên thay thế
            </Button>
          </div>
        </>
      ) : null}

      {tab === "Ngân sách & lịch" ? (
        <>
          <SectionHeading title="Ngân sách" />
          <div className="two-column">
            <label className="field">
              <span>Ngân sách nhập hàng tháng</span>
              <input
                type="number"
                min="0"
                step="100000"
                value={settings.monthlyBudget}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    monthlyBudget: Number(event.target.value),
                  }))
                }
              />
              <small>{formatVnd(settings.monthlyBudget)}</small>
            </label>
            <label className="field">
              <span>Ngân sách còn lại</span>
              <input
                type="number"
                min="0"
                step="100000"
                value={settings.remainingBudget}
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    remainingBudget: Number(event.target.value),
                  }))
                }
              />
              <small>{formatVnd(settings.remainingBudget)}</small>
            </label>
          </div>

          <SectionHeading
            title="Lịch 14 ngày tới"
            subtitle="Đánh dấu ngày lễ hoặc khuyến mãi."
          />
          <div className="calendar-grid">
            {calendar.map((day, index) => (
              <label className="calendar-day" key={day.date}>
                <span>{day.weekday.replace("Thứ ", "T")}</span>
                <strong>{formatDate(day.date).slice(0, 5)}</strong>
                <small>
                  <input
                    type="checkbox"
                    checked={day.promotion}
                    onChange={(event) =>
                      setCalendar((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                promotion: event.target.checked,
                                promotionNote: event.target.checked
                                  ? item.promotionNote || "Khuyến mãi"
                                  : "",
                              }
                            : item,
                        ),
                      )
                    }
                  />
                  Khuyến mãi
                </small>
              </label>
            ))}
          </div>
          <div className="settings-action">
            <Button
              variant="primary"
              busy={saving === "context"}
              onClick={() => {
                void (async () => {
                  setSaving("context");
                  try {
                    if (await onSaveContext(settings, calendar)) {
                      setMessage("Đã lưu ngân sách và lịch.");
                    }
                  } finally {
                    setSaving("");
                  }
                })();
              }}
            >
              <Save size={16} />
              Lưu ngân sách và lịch
            </Button>
          </div>
        </>
      ) : null}

      {tab === "Lịch sử" ? (
        <div className="history-sections">
          <section>
            <SectionHeading title="Lịch sử nhập dữ liệu" />
            {importLogs.length > 0 ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Tệp</th>
                      <th>Sheet</th>
                      <th>Loại dữ liệu</th>
                      <th>Số dòng</th>
                      <th>Thời điểm</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...importLogs].reverse().map((log) => (
                      <tr key={`${log.file}-${log.sheet}-${log.importedAt}`}>
                        <td>{log.file}</td>
                        <td>{log.sheet}</td>
                        <td>{log.dataType}</td>
                        <td>{log.rows}</td>
                        <td>{new Date(log.importedAt).toLocaleString("vi-VN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="quiet-help">Chưa có lần nhập dữ liệu nào.</p>
            )}
          </section>
          <section>
            <SectionHeading title="Phiên bản công thức" />
            {recipeVersions.length > 0 ? (
              <div className="version-list">
                {[...recipeVersions].reverse().map((version) => (
                  <div className="version-row" key={version.savedAt}>
                    <span>{version.product}</span>
                    <strong>{version.rows.length} nguyên liệu</strong>
                    <small>
                      Hiệu lực đến {formatDate(version.effectiveUntil)}
                    </small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quiet-help">Chưa có phiên bản công thức cũ.</p>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
