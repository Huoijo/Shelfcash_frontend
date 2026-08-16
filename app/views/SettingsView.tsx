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
  GuidanceHint,
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

type DefaultStrategy = "economy" | "balanced" | "safe";

type SettingsDraft = Settings & {
  reservedBudget: number;
  spentBudget: number;
  defaultStrategy: DefaultStrategy;
  version: number;
};

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settingsDraftFrom(settings: Settings): SettingsDraft {
  const extended = settings as Settings &
    Partial<{
      reservedBudget: number;
      spentBudget: number;
      defaultStrategy: DefaultStrategy;
      version: number;
    }>;
  const defaultStrategy = ["economy", "balanced", "safe"].includes(
    String(extended.defaultStrategy),
  )
    ? (extended.defaultStrategy as DefaultStrategy)
    : "balanced";
  return {
    ...settings,
    forecastHorizon: Math.min(
      7,
      Math.max(1, finiteNumber(settings.forecastHorizon, 7)),
    ),
    reservedBudget: finiteNumber(extended.reservedBudget),
    spentBudget: finiteNumber(extended.spentBudget),
    defaultStrategy,
    version: finiteNumber(extended.version),
  };
}

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
    settings: SettingsDraft,
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
  const [settings, setSettings] = useState(() =>
    settingsDraftFrom(data.settings),
  );
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
    setSettings(settingsDraftFrom(data.settings));
    setCalendar(data.futureCalendar.map((day) => ({ ...day })));
  }, [data]);

  function updateSupplierTerm(index: number, patch: Partial<SupplierConstraintRow>) {
    setSupplierTerms((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
    setMessage("");
  }

  return (
    <>
      <PageHeader title="Cài đặt" />
      <TabList items={tabs} value={tab} onChange={setTab} />
      {message ? <Notice tone="success">{message}</Notice> : null}

      {tab === "Nhà cung cấp" ? (
        <>
          <SectionHeading
            title="Quy tắc theo nguyên liệu"
            guidance={<GuidanceHint content="Thêm nhà cung cấp mới trong Nhập dữ liệu." />}
          />
          <div className="table-wrap settings-table">
            <table>
              <thead>
                <tr>
                  <th>Nguyên liệu</th>
                  <th>Đơn giá</th>
                  <th>Nhà cung cấp</th>
                  <th>Thời gian giao (ngày)</th>
                  <th>Đặt tối thiểu</th>
                  <th>Quy cách đóng gói</th>
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
                      <strong>{item.supplier || "Chưa thiết lập"}</strong>
                    </td>
                    <td>
                      <input
                        type="number"
                        value={item.leadTimeDays}
                        min="0"
                        step="1"
                        aria-label={`Thời gian giao ${item.ingredient}`}
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
                        aria-label={`Số lượng đặt tối thiểu ${item.ingredient}`}
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
            guidance={<GuidanceHint content="Các ngưỡng này chỉ xem được ở đây. Cập nhật chúng trong Nhập dữ liệu → Ràng buộc kinh doanh." />}
          />
          {inventoryConstraintsLoading ? (
            <p className="quiet-help">Đang tải ngưỡng tồn kho...</p>
          ) : inventoryConstraintsError ? (
            <Notice tone="error">
              Không tải được ngưỡng tồn kho. Vui lòng thử lại.
            </Notice>
          ) : procurementRows.length === 0 ? (
            <p className="quiet-help">Chưa cấu hình ngưỡng tồn kho.</p>
          ) : (
            <div className="table-wrap settings-table">
              <table>
                <thead><tr><th>Nguyên liệu</th><th>Tồn kho an toàn</th><th>Tồn kho tối đa</th><th>Ngày hiệu lực</th><th>Phiên bản</th><th>Trạng thái</th></tr></thead>
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
        </>
      ) : null}

      {tab === "Tên thay thế" ? (
        <>
          <SectionHeading
            title="Tên thay thế"
          />
          <div className="alias-editor">
            {aliases.map((alias, index) => (
              <div className="alias-row" key={`${alias.sourceName}-${index}`}>
                <input
                  value={alias.sourceName}
                  placeholder="Tên trong tệp nguồn"
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
                  onChange={(event) => {
                    const ingredient = data.ingredients.find(
                      (item) => item.ingredient === event.target.value,
                    );
                    setAliases((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              canonicalName: event.target.value,
                              ingredientId: ingredient?.ingredientId,
                            }
                          : item,
                      ),
                    );
                  }}
                >
                  {!data.ingredients.some(
                    (item) => item.ingredient === alias.canonicalName,
                  ) && alias.canonicalName ? (
                    <option value={alias.canonicalName}>
                      {alias.canonicalName} · chưa có trong danh mục hiện tại
                    </option>
                  ) : null}
                  {data.ingredients.map((item) => (
                    <option
                      value={item.ingredient}
                      key={item.ingredientId ?? item.ingredient}
                    >
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
              disabled={!data.ingredients.length}
              onClick={() =>
                setAliases((current) => [
                  ...current,
                  {
                    sourceName: "",
                    canonicalName: data.ingredients[0]?.ingredient ?? "",
                    ingredientId: data.ingredients[0]?.ingredientId,
                  },
                ])
              }
            >
              <Plus size={15} />
              Thêm tên thay thế
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
              <span>Đã giữ cho đơn đã xác nhận</span>
              <input
                type="number"
                readOnly
                value={settings.reservedBudget}
                aria-label="Ngân sách đã giữ chỗ"
              />
              <small>{formatVnd(settings.reservedBudget)}</small>
            </label>
          </div>
          <div className="two-column">
            <label className="field">
              <span>Đã chi</span>
              <input
                type="number"
                readOnly
                value={settings.spentBudget}
                aria-label="Ngân sách đã chi"
              />
              <small>{formatVnd(settings.spentBudget)}</small>
            </label>
            <label className="field">
              <span>Ngân sách còn lại</span>
              <input
                type="number"
                readOnly
                value={settings.remainingBudget}
                aria-label="Ngân sách còn lại"
              />
              <small>{formatVnd(settings.remainingBudget)}</small>
            </label>
          </div>

          <SectionHeading title="Dự báo và chiến lược mặc định" />
          <div className="two-column">
            <label className="field">
              <span>Số ngày dự báo (1–7)</span>
              <input
                type="number"
                min={1}
                max={7}
                value={settings.forecastHorizon}
                aria-label="Số ngày dự báo"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    forecastHorizon: Math.min(
                      7,
                      Math.max(1, Number(event.target.value) || 1),
                    ),
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Chiến lược mặc định</span>
              <select
                value={settings.defaultStrategy}
                aria-label="Chiến lược mặc định"
                onChange={(event) =>
                  setSettings((current) => ({
                    ...current,
                    defaultStrategy: event.target.value as DefaultStrategy,
                  }))
                }
              >
                <option value="economy">Tiết kiệm</option>
                <option value="balanced">Cân bằng</option>
                <option value="safe">An toàn</option>
              </select>
            </label>
          </div>

          <SectionHeading title="Lịch 14 ngày tới" />
          <div className="calendar-grid">
            {calendar.map((day, index) => (
              <div className="calendar-day" key={day.date}>
                <span>{day.weekday.replace("Thứ ", "T")}</span>
                <strong>{formatDate(day.date).slice(0, 5)}</strong>
                <label>
                  <input
                    type="checkbox"
                    checked={day.holiday}
                    aria-label={`Ngày lễ ${day.date}`}
                    onChange={(event) =>
                      setCalendar((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? { ...item, holiday: event.target.checked }
                            : item,
                        ),
                      )
                    }
                  />
                  Ngày lễ
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={day.promotion}
                    aria-label={`Khuyến mãi ${day.date}`}
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
                </label>
                <input
                  value={day.promotionNote}
                  disabled={!day.promotion}
                  aria-label={`Ghi chú khuyến mãi ${day.date}`}
                  placeholder="Nội dung khuyến mãi"
                  onChange={(event) =>
                    setCalendar((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, promotionNote: event.target.value }
                          : item,
                      ),
                    )
                  }
                />
              </div>
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
                      setMessage("Đã lưu ngân sách, dự báo và lịch vận hành.");
                    }
                  } finally {
                    setSaving("");
                  }
                })();
              }}
            >
              <Save size={16} />
              Lưu cài đặt
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
                      <th>Trang tính</th>
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
