import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Minus, PackagePlus, Pencil, Plus, Printer, ShoppingBag, Trash2, Undo2 } from 'lucide-react';
import clsx from 'clsx';
import { productsApi, salesApi, stockApi } from '../../../api/endpoints-ops';
import { membersApi } from '../../../api/endpoints';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../api/auth';
import type { PaymentMethod } from '../../../api/types';
import type { ProductCategory, ProductDto, SaleDto } from '../../../api/types-ops';
import { Badge } from '../../../components/ui/Badge';
import { Button, IconButton } from '../../../components/ui/Button';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader } from '../../../components/ui/Card';
import { DataTable } from '../../../components/ui/DataTable';
import { Input, SearchInput, Select } from '../../../components/ui/Field';
import { enumOptions, FormModal, type FieldDef } from '../../../components/ui/FormModal';
import { Modal, useConfirm } from '../../../components/ui/Modal';
import { Pagination } from '../../../components/ui/Pagination';
import { Tabs } from '../../../components/ui/Tabs';
import { useToast } from '../../../components/ui/Toast';
import { formatDateTime, formatTND, fullName, isoDay, PAYMENT_METHOD_LABELS } from '../../../lib/format';
import { PRODUCT_CATEGORY_LABELS, STOCK_MOVEMENT_LABELS } from '../../../lib/labels-ops';
import { useI18n } from '../../../i18n';

type TabKey = 'pos' | 'products' | 'stock' | 'sales';

const PRODUCT_FIELDS = (isNew: boolean): FieldDef[] => [
  { name: 'name', label: 'Produit', required: true },
  { name: 'category', label: 'Catégorie', type: 'select', required: true, options: enumOptions(PRODUCT_CATEGORY_LABELS) },
  { name: 'price', label: 'Prix de vente (DT)', type: 'number', required: true, min: 0, step: 0.001 },
  { name: 'cost', label: 'Coût d’achat (DT)', type: 'number', min: 0, step: 0.001, hint: 'Sert au calcul de la marge.' },
  { name: 'sku', label: 'Référence / code-barres' },
  { name: 'lowStockThreshold', label: 'Alerte stock bas sous', type: 'number', min: 0, step: 1 },
  ...(isNew ? ([{ name: 'stock', label: 'Stock initial', type: 'number', min: 0, step: 1 }] satisfies FieldDef[]) : []),
  { name: 'imageUrl', label: 'Photo (URL)', wide: true },
  { name: 'isActive', label: 'En vente', type: 'checkbox' },
];

const MOVE_FIELDS = (products: ProductDto[]): FieldDef[] => [
  {
    name: 'productId',
    label: 'Produit',
    type: 'select',
    required: true,
    options: products.filter((p) => p.stock !== null).map((p) => ({ value: p.id, label: `${p.name} (stock ${p.stock})` })),
  },
  {
    name: 'type',
    label: 'Mouvement',
    type: 'select',
    required: true,
    options: [
      { value: 'IN', label: 'Entrée (livraison)' },
      { value: 'OUT', label: 'Sortie (casse, usage interne)' },
      { value: 'ADJUSTMENT', label: 'Inventaire (stock compté)' },
    ],
  },
  { name: 'quantity', label: 'Quantité', type: 'number', required: true, min: 0, step: 1, hint: 'Pour un inventaire : le stock réellement compté.' },
  { name: 'unitCost', label: 'Coût unitaire (DT)', type: 'number', min: 0, step: 0.001, hidden: (v) => v.type !== 'IN' },
  { name: 'reason', label: 'Motif', wide: true },
];

function Receipt({ sale }: { sale: SaleDto }) {
  const { t } = useI18n();
  return (
    <div className="receipt mx-auto w-full max-w-xs text-sm text-fg">
      <div className="flex flex-col items-center gap-2 border-b border-dashed border-line pb-3 text-center">
        <span className="flex size-12 items-center justify-center overflow-hidden rounded-lg bg-white">
          <img src="/images/logo.jpg" alt="" className="size-full object-contain" />
        </span>
        <p className="font-semibold">Meliora Gym</p>
        <p className="text-xs text-muted">{t('Khzema Est, Rue Colonel Garnaoui, Sousse')}</p>
        <p className="text-xs text-muted">{t('Ticket {number}, {date}', { number: sale.number, date: formatDateTime(sale.createdAt) })}</p>
      </div>
      <table className="my-3 w-full">
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.productId}>
              <td className="py-0.5">
                {item.quantity} × {item.name}
              </td>
              <td className="py-0.5 text-end tabular">{formatTND(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex flex-col gap-1 border-t border-dashed border-line pt-2">
        {sale.discount > 0 && (
          <p className="flex justify-between text-fg-2">
            <span>{t('Remise')}</span>
            <span className="tabular">−{formatTND(sale.discount)}</span>
          </p>
        )}
        <p className="flex justify-between text-base font-semibold">
          <span>{t('Total')}</span>
          <span className="tabular">{formatTND(sale.total)}</span>
        </p>
        <p className="flex justify-between text-xs text-muted">
          <span>{t(PAYMENT_METHOD_LABELS[sale.paymentMethod])}</span>
          <span>{sale.soldByName ?? ''}</span>
        </p>
        {sale.status === 'REFUNDED' && <p className="mt-1 text-center font-semibold text-bad">{t('Vente remboursée')}</p>}
      </div>
    </div>
  );
}

function ReceiptModal({ sale, onClose }: { sale: SaleDto | null; onClose: () => void }) {
  const { t } = useI18n();
  return (
    <Modal
      open={Boolean(sale)}
      onClose={onClose}
      title={t('Ticket de caisse')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('Fermer')}
          </Button>
          <Button icon={<Printer className="size-4" />} onClick={() => window.print()}>
            {t('Imprimer')}
          </Button>
        </>
      }
    >
      {sale && <Receipt sale={sale} />}
    </Modal>
  );
}

function PosTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [category, setCategory] = useState<ProductCategory | ''>('');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<Map<string, number>>(new Map());
  const [discount, setDiscount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [memberSearch, setMemberSearch] = useState('');
  const [member, setMember] = useState<{ id: string; name: string; email: string } | null>(null);
  const [receipt, setReceipt] = useState<SaleDto | null>(null);

  const products = useQuery({ queryKey: ['products', 'pos'], queryFn: () => productsApi.list() });
  const members = useQuery({
    queryKey: ['members', 'pos', memberSearch],
    queryFn: () => membersApi.list({ search: memberSearch, pageSize: 5 }),
    enabled: memberSearch.trim().length >= 2 && !member,
  });

  const visible = (products.data ?? []).filter(
    (p) => p.isActive && (!category || p.category === category) && (!search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku?.includes(search)),
  );
  const byId = useMemo(() => new Map((products.data ?? []).map((p) => [p.id, p])), [products.data]);
  const lines = [...cart.entries()].map(([id, qty]) => ({ product: byId.get(id)!, qty })).filter((l) => l.product);
  const subtotal = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount.replace(',', '.')) || 0));
  const total = subtotal - discountValue;

  const change = (id: string, delta: number) =>
    setCart((prev) => {
      const next = new Map(prev);
      const product = byId.get(id);
      const qty = (next.get(id) ?? 0) + delta;
      if (product && product.stock !== null && qty > product.stock) return prev;
      if (qty <= 0) next.delete(id);
      else next.set(id, qty);
      return next;
    });

  const checkout = useMutation({
    mutationFn: () =>
      salesApi.create({
        items: lines.map((l) => ({ productId: l.product.id, quantity: l.qty })),
        discount: discountValue || undefined,
        paymentMethod: method,
        memberId: member?.id ?? null,
        memberName: member?.name ?? null,
        memberEmail: member?.email ?? null,
      }),
    onSuccess: (sale) => {
      setReceipt(sale);
      setCart(new Map());
      setDiscount('');
      setMember(null);
      setMemberSearch('');
      toast.success(t('Vente {number} encaissée : {total}.', { number: sale.number, total: formatTND(sale.total) }));
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['sales'] });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <SearchInput value={search} onChange={setSearch} placeholder={t('Produit ou code-barres')} className="w-full sm:w-72" />
          <Tabs
            value={category}
            onChange={setCategory}
            items={[{ key: '' as ProductCategory | '', label: 'Tout' }, ...(Object.keys(PRODUCT_CATEGORY_LABELS) as ProductCategory[]).map((c) => ({ key: c, label: PRODUCT_CATEGORY_LABELS[c] }))]}
          />
        </div>
        {products.isError && <ErrorNote message={errorMessage(products.error)} onRetry={() => products.refetch()} />}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {visible.map((p) => {
            const out = p.stock !== null && p.stock <= 0;
            const inCart = cart.get(p.id) ?? 0;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={out}
                  onClick={() => change(p.id, 1)}
                  className={clsx(
                    'relative flex h-full w-full flex-col rounded-xl bg-card p-3 text-start ring-1 transition-[box-shadow,transform] active:scale-[0.98] disabled:opacity-45',
                    inCart ? 'ring-2 ring-brand-500' : 'ring-line hover:ring-fg-2/40',
                  )}
                >
                  {inCart > 0 && (
                    <span className="absolute end-2 top-2 flex size-6 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white tabular">{inCart}</span>
                  )}
                  {p.imageUrl ? (
                    <img src={p.imageUrl} alt="" className="mb-2 aspect-[4/3] w-full rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="mb-2 flex aspect-[4/3] w-full items-center justify-center rounded-lg bg-card-2 text-muted">
                      <ShoppingBag className="size-6" aria-hidden />
                    </span>
                  )}
                  <span className="text-sm leading-snug font-semibold text-fg">{p.name}</span>
                  <span className="mt-auto flex items-baseline justify-between gap-2 pt-1">
                    <span className="text-sm font-semibold text-fg">{formatTND(p.price)}</span>
                    {p.stock !== null && <span className={clsx('text-xs', p.isLowStock ? 'text-warn' : 'text-muted')}>{out ? t('Épuisé') : t('{n} en stock', { n: p.stock })}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {!products.isLoading && visible.length === 0 && <EmptyState title={t('Aucun produit')} description={t('Ajoutez vos produits dans l’onglet Produits.')} />}
      </div>

      <Card className="flex h-fit flex-col xl:sticky xl:top-20">
        <CardHeader title={t('Panier')} description={lines.length ? t('Articles : {n}', { n: lines.reduce((s, l) => s + l.qty, 0) }) : t('Touchez un produit pour l’ajouter')} />
        <ul className="flex flex-col divide-y divide-line px-5">
          {lines.map(({ product, qty }) => (
            <li key={product.id} className="flex items-center gap-2 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{product.name}</p>
                <p className="text-xs text-muted">{formatTND(product.price)}</p>
              </div>
              <IconButton label={t('Retirer un {name}', { name: product.name })} onClick={() => change(product.id, -1)}>
                <Minus className="size-4" />
              </IconButton>
              <span className="w-6 text-center text-sm font-semibold tabular">{qty}</span>
              <IconButton label={t('Ajouter un {name}', { name: product.name })} onClick={() => change(product.id, 1)}>
                <Plus className="size-4" />
              </IconButton>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t border-line px-5 py-4">
          {member ? (
            <div className="flex items-center justify-between rounded-lg bg-page px-3 py-2 text-sm ring-1 ring-line">
              <span>
                {t('Membre')} : <span className="font-semibold">{member.name}</span>
              </span>
              <button type="button" className="text-xs text-fg-2 underline" onClick={() => setMember(null)}>
                {t('Retirer')}
              </button>
            </div>
          ) : (
            <div className="relative">
              <Input label={t('Membre (facultatif, pour le ticket par e-mail)')} value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} placeholder={t('Nom ou téléphone')} />
              {members.data && members.data.items.length > 0 && (
                <ul className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg bg-card shadow-xl ring-1 ring-line">
                  {members.data.items.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-start text-sm hover:bg-card-2"
                        onClick={() => setMember({ id: m.id, name: fullName(m), email: m.email })}
                      >
                        {fullName(m)} <span className="text-xs text-muted">{m.memberCode}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <Input label={t('Remise (DT)')} type="number" min={0} step={0.001} inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
          <div role="radiogroup" aria-label={t('Moyen de paiement')} className="grid grid-cols-2 gap-2">
            {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={clsx('h-10 rounded-lg text-sm font-medium ring-1', method === m ? 'bg-fg text-page ring-fg' : 'text-fg-2 ring-line hover:text-fg')}
              >
                {t(PAYMENT_METHOD_LABELS[m])}
              </button>
            ))}
          </div>
          <dl className="flex flex-col gap-1 text-sm">
            <div className="flex justify-between text-fg-2">
              <dt>{t('Sous-total')}</dt>
              <dd className="tabular">{formatTND(subtotal)}</dd>
            </div>
            {discountValue > 0 && (
              <div className="flex justify-between text-fg-2">
                <dt>{t('Remise')}</dt>
                <dd className="tabular">−{formatTND(discountValue)}</dd>
              </div>
            )}
            <div className="flex justify-between text-lg font-semibold text-fg">
              <dt>{t('Total')}</dt>
              <dd className="tabular">{formatTND(total)}</dd>
            </div>
          </dl>
          <Button size="lg" disabled={lines.length === 0} loading={checkout.isPending} onClick={() => checkout.mutate()}>
            {t('Encaisser {amount}', { amount: formatTND(total) })}
          </Button>
        </div>
      </Card>
      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}

function ProductsTab() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<ProductDto | 'new' | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [lowOnly, setLowOnly] = useState(false);
  const products = useQuery({ queryKey: ['products', 'admin', lowOnly], queryFn: () => productsApi.list({ includeInactive: true, lowStockOnly: lowOnly || undefined }) });
  const all = useQuery({ queryKey: ['products', 'pos'], queryFn: () => productsApi.list() });
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['products'] });

  return (
    <Card>
      <CardHeader
        title={t('Produits')}
        actions={
          <>
            <Button variant={lowOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setLowOnly((v) => !v)} aria-pressed={lowOnly}>
              {t('Stocks bas')}
            </Button>
            <Button size="sm" variant="secondary" icon={<PackagePlus className="size-4" />} onClick={() => setMoving('')}>
              {t('Mouvement de stock')}
            </Button>
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setEditing('new')}>
              {t('Nouveau produit')}
            </Button>
          </>
        }
      />
      {products.isError && <ErrorNote message={errorMessage(products.error)} onRetry={() => products.refetch()} />}
      <DataTable
        rows={products.data}
        rowKey={(p) => p.id}
        loading={products.isLoading}
        empty={<EmptyState title={lowOnly ? t('Aucun stock bas') : t('Aucun produit')} />}
        columns={[
          { key: 'name', header: 'Produit', cell: (p) => <div><p className="font-medium">{p.name}</p><p className="text-xs text-muted">{p.sku ?? t(PRODUCT_CATEGORY_LABELS[p.category])}</p></div> },
          { key: 'cat', header: 'Catégorie', hideOnMobile: true, cell: (p) => t(PRODUCT_CATEGORY_LABELS[p.category]) },
          { key: 'price', header: 'Prix', align: 'right', cell: (p) => formatTND(p.price) },
          { key: 'margin', header: 'Marge', align: 'right', hideOnMobile: true, cell: (p) => (p.cost !== null ? formatTND(p.price - p.cost) : '—') },
          {
            key: 'stock',
            header: 'Stock',
            align: 'right',
            cell: (p) =>
              p.stock === null ? (
                <span className="text-muted">{t('Service')}</span>
              ) : p.isLowStock ? (
                <Badge tone="warn">{t('{n} : stock bas', { n: p.stock })}</Badge>
              ) : (
                p.stock
              ),
          },
          { key: 'active', header: 'Statut', hideOnMobile: true, cell: (p) => (p.isActive ? <Badge tone="good">{t('En vente')}</Badge> : <Badge>{t('Retiré')}</Badge>) },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (p) => (
              <div className="flex justify-end gap-1">
                {p.stock !== null && (
                  <IconButton label={t('Mouvement de stock pour {name}', { name: p.name })} onClick={() => setMoving(p.id)}>
                    <PackagePlus className="size-4" />
                  </IconButton>
                )}
                <IconButton label={t('Modifier {name}', { name: p.name })} onClick={() => setEditing(p)}>
                  <Pencil className="size-4" />
                </IconButton>
                <IconButton
                  label={t('Supprimer {name}', { name: p.name })}
                  onClick={async () => {
                    if (!(await confirm({ title: t('Supprimer {name} ?', { name: p.name }), message: t('Un produit déjà vendu est simplement retiré de la vente.'), confirmLabel: t('Supprimer'), danger: true }))) return;
                    try {
                      await productsApi.remove(p.id);
                      refresh();
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            ),
          },
        ]}
      />
      <FormModal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('Nouveau produit') : t('Modifier le produit')}
        submitLabel={editing === 'new' ? t('Créer le produit') : t('Enregistrer')}
        fields={PRODUCT_FIELDS(editing === 'new')}
        initial={editing === 'new' || !editing ? { category: 'DRINK', isActive: true, lowStockThreshold: 5, stock: 0 } : { ...editing }}
        onSubmit={async (v) => {
          if (editing === 'new') await productsApi.create(v);
          else if (editing) {
            const { stock: _stock, ...data } = v;
            void _stock;
            await productsApi.update(editing.id, data);
          }
          toast.success(t('Produit enregistré.'));
          refresh();
        }}
      />
      <FormModal
        open={moving !== null}
        onClose={() => setMoving(null)}
        title={t('Mouvement de stock')}
        submitLabel={t('Enregistrer le mouvement')}
        size="md"
        fields={MOVE_FIELDS(all.data ?? [])}
        initial={{ productId: moving ?? '', type: 'IN' }}
        onSubmit={async (v) => {
          await stockApi.move({
            productId: String(v.productId),
            type: v.type as 'IN' | 'OUT' | 'ADJUSTMENT',
            quantity: Number(v.quantity),
            unitCost: (v.unitCost as number | null) ?? null,
            reason: (v.reason as string | null) ?? null,
          });
          toast.success(t('Stock mis à jour.'));
          refresh();
          void queryClient.invalidateQueries({ queryKey: ['stock'] });
        }}
      />
    </Card>
  );
}

function StockTab() {
  const { t } = useI18n();
  const [productId, setProductId] = useState('');
  const products = useQuery({ queryKey: ['products', 'pos'], queryFn: () => productsApi.list() });
  const moves = useQuery({ queryKey: ['stock', productId], queryFn: () => stockApi.movements(productId || undefined, 200) });
  return (
    <Card>
      <CardHeader
        title={t('Mouvements de stock')}
        description={t('Livraisons, ventes, retours et inventaires.')}
        actions={
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} aria-label={t('Produit')} className="w-56">
            <option value="">{t('Tous les produits')}</option>
            {products.data?.filter((p) => p.stock !== null).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        }
      />
      {moves.isError && <ErrorNote message={errorMessage(moves.error)} onRetry={() => moves.refetch()} />}
      <DataTable
        rows={moves.data}
        rowKey={(m) => m.id}
        loading={moves.isLoading}
        empty={<EmptyState title={t('Aucun mouvement')} />}
        columns={[
          { key: 'date', header: 'Date', cell: (m) => formatDateTime(m.createdAt) },
          { key: 'product', header: 'Produit', cell: (m) => m.productName },
          { key: 'type', header: 'Type', cell: (m) => t(STOCK_MOVEMENT_LABELS[m.type]) },
          { key: 'qty', header: 'Quantité', align: 'right', cell: (m) => <span className={m.quantity < 0 ? 'text-bad' : 'text-good'}>{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</span> },
          { key: 'reason', header: 'Motif', hideOnMobile: true, cell: (m) => m.reason ?? '—' },
          { key: 'by', header: 'Par', hideOnMobile: true, cell: (m) => m.createdByName ?? '—' },
        ]}
      />
    </Card>
  );
}

function SalesTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [from, setFrom] = useState(isoDay(new Date(Date.now() - 6 * 86_400_000)));
  const [to, setTo] = useState(isoDay());
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<SaleDto | null>(null);
  const sales = useQuery({
    queryKey: ['sales', from, to, page],
    queryFn: () =>
      salesApi.list({
        from: new Date(`${from}T00:00:00`).toISOString(),
        to: new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString(),
        page,
        pageSize: 25,
      }),
    placeholderData: keepPreviousData,
  });
  return (
    <Card>
      <CardHeader
        title={t('Ventes')}
        description={sales.data ? t('{n} ventes, {sum}', { n: sales.data.total, sum: formatTND(sales.data.sum) }) : undefined}
        actions={
          <div className="flex gap-2">
            <Input type="date" aria-label={t('Du')} value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
            <Input type="date" aria-label={t('Au')} value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        }
      />
      {sales.isError && <ErrorNote message={errorMessage(sales.error)} onRetry={() => sales.refetch()} />}
      <DataTable
        rows={sales.data?.items}
        rowKey={(s) => s.id}
        loading={sales.isLoading}
        fetching={sales.isFetching}
        onRowClick={setReceipt}
        empty={<EmptyState title={t('Aucune vente sur cette période')} />}
        columns={[
          { key: 'num', header: 'Ticket', cell: (s) => <span className="font-medium">{s.number}</span> },
          { key: 'date', header: 'Date', cell: (s) => formatDateTime(s.createdAt) },
          { key: 'items', header: 'Articles', hideOnMobile: true, cell: (s) => s.items.map((i) => `${i.quantity}× ${i.name}`).join(', ') },
          { key: 'method', header: 'Paiement', hideOnMobile: true, cell: (s) => t(PAYMENT_METHOD_LABELS[s.paymentMethod]) },
          { key: 'status', header: 'Statut', cell: (s) => (s.status === 'REFUNDED' ? <Badge tone="bad">{t('Remboursée')}</Badge> : <Badge tone="good">{t('Payée')}</Badge>) },
          { key: 'total', header: 'Total', align: 'right', cell: (s) => <span className="font-semibold">{formatTND(s.total)}</span> },
          {
            key: 'actions',
            header: <span className="sr-only">{t('Actions')}</span>,
            align: 'right',
            cell: (s) =>
              user?.role === 'ADMIN' &&
              s.status === 'COMPLETED' && (
                <IconButton
                  label={t('Rembourser {number}', { number: s.number })}
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (!(await confirm({ title: t('Rembourser la vente {number} ?', { number: s.number }), message: t('{amount} ; les articles reviennent en stock.', { amount: formatTND(s.total) }), confirmLabel: t('Rembourser'), danger: true }))) return;
                    try {
                      await salesApi.refund(s.id);
                      toast.success(t('Vente remboursée.'));
                      void queryClient.invalidateQueries({ queryKey: ['sales'] });
                      void queryClient.invalidateQueries({ queryKey: ['products'] });
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Undo2 className="size-4" />
                </IconButton>
              ),
          },
        ]}
      />
      {sales.data && sales.data.total > 25 && <Pagination page={page} pageSize={25} total={sales.data.total} onChange={setPage} />}
      <ReceiptModal sale={receipt} onClose={() => setReceipt(null)} />
    </Card>
  );
}

export function ShopPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<TabKey>('pos');
  return (
    <div>
      <PageHeader title={t('Boutique')} description={t('Caisse, produits, stock et historique des ventes.')} />
      <Tabs
        className="mb-5 w-fit"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'pos', label: 'Caisse' },
          { key: 'products', label: 'Produits' },
          { key: 'stock', label: 'Stock' },
          { key: 'sales', label: 'Ventes' },
        ]}
      />
      {tab === 'pos' && <PosTab />}
      {tab === 'products' && <ProductsTab />}
      {tab === 'stock' && <StockTab />}
      {tab === 'sales' && <SalesTab />}
    </div>
  );
}
