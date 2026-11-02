import { lazy, Suspense, type ComponentType } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from '../api/auth';
import type { Role } from '../api/types';
import { PageSpinner } from '../components/ui/Spinner';
import { registerMessages } from '../i18n/messages';
import { admin } from '../i18n/messages/admin';
import { AdminLayout } from './AdminLayout';
import { RequireAuth, RoleGate } from './guards';
import { LoginPage } from './LoginPage';
import { homeFor } from './nav';

// The back-office copy ships with this chunk only (the public site never downloads it).
registerMessages(admin);

/** Lazy-load a named export so the public site never downloads the back-office. */
function lazyNamed<M extends Record<string, unknown>>(loader: () => Promise<M>, name: keyof M) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }));
}

const DashboardPage = lazyNamed(() => import('./pages/DashboardPage'), 'DashboardPage');
const MembersPage = lazyNamed(() => import('./pages/members/MembersPage'), 'MembersPage');
const MemberDetailPage = lazyNamed(() => import('./pages/members/MemberDetailPage'), 'MemberDetailPage');
const LeadsPage = lazyNamed(() => import('./pages/LeadsPage'), 'LeadsPage');
const PlanningPage = lazyNamed(() => import('./pages/PlanningPage'), 'PlanningPage');
const TrainingPage = lazyNamed(() => import('./pages/training/TrainingPage'), 'TrainingPage');
const AccessPage = lazyNamed(() => import('./pages/AccessPage'), 'AccessPage');
const ScannerPage = lazyNamed(() => import('./pages/ScannerPage'), 'ScannerPage');
const TasksPage = lazyNamed(() => import('./pages/workflows/TasksPage'), 'TasksPage');
const WorkflowsPage = lazyNamed(() => import('./pages/workflows/WorkflowsPage'), 'WorkflowsPage');
const WorkflowEditorPage = lazyNamed(() => import('./pages/workflows/WorkflowEditorPage'), 'WorkflowEditorPage');
const RunDetailPage = lazyNamed(() => import('./pages/workflows/RunDetailPage'), 'RunDetailPage');
const ShopPage = lazyNamed(() => import('./pages/shop/ShopPage'), 'ShopPage');
const FacilityPage = lazyNamed(() => import('./pages/facility/FacilityPage'), 'FacilityPage');
const HrPage = lazyNamed(() => import('./pages/hr/HrPage'), 'HrPage');
const TeamCalendarPage = lazyNamed(() => import('./pages/hr/TeamCalendarPage'), 'TeamCalendarPage');
const PerformancePage = lazyNamed(() => import('./pages/PerformancePage'), 'PerformancePage');
const PaymentsPage = lazyNamed(() => import('./pages/PaymentsPage'), 'PaymentsPage');
const FinancePage = lazyNamed(() => import('./pages/FinancePage'), 'FinancePage');
const PromosPage = lazyNamed(() => import('./pages/PromosPage'), 'PromosPage');
const PlansPage = lazyNamed(() => import('./pages/PlansPage'), 'PlansPage');
const TeamPage = lazyNamed(() => import('./pages/TeamPage'), 'TeamPage');

const ALL: Role[] = ['ADMIN', 'STAFF', 'COACH'];
const DESK: Role[] = ['ADMIN', 'STAFF'];
const ADMIN: Role[] = ['ADMIN'];

function gate(roles: Role[], Page: ComponentType) {
  return (
    <RoleGate roles={roles}>
      <Suspense fallback={<PageSpinner />}>
        <Page />
      </Suspense>
    </RoleGate>
  );
}

function AdminHome() {
  const { user } = useAuth();
  if (user?.role === 'COACH') return <Navigate to={homeFor(user.role)} replace />;
  return gate(DESK, DashboardPage);
}

/** Every /admin/* route: login, layout and the lazily loaded pages. */
export default function AdminApp() {
  return (
    <Routes>
            <Route path="login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <AdminLayout />
                </RequireAuth>
              }
            >
              <Route index element={<AdminHome />} />
              <Route path="membres" element={gate(DESK, MembersPage)} />
              <Route path="membres/:id" element={gate(DESK, MemberDetailPage)} />
              <Route path="prospects" element={gate(DESK, LeadsPage)} />
              <Route path="planning" element={gate(ALL, PlanningPage)} />
              <Route path="entrainement" element={gate(ALL, TrainingPage)} />
              <Route path="acces" element={gate(DESK, AccessPage)} />
              <Route path="scanner" element={gate(DESK, ScannerPage)} />
              <Route path="taches" element={gate(ALL, TasksPage)} />
              <Route path="workflows" element={gate(DESK, WorkflowsPage)} />
              <Route path="workflows/nouveau" element={gate(ADMIN, WorkflowEditorPage)} />
              <Route path="workflows/:id" element={gate(DESK, WorkflowEditorPage)} />
              <Route path="workflows/runs/:runId" element={gate(ALL, RunDetailPage)} />
              <Route path="boutique" element={gate(DESK, ShopPage)} />
              <Route path="salles" element={gate(DESK, FacilityPage)} />
              <Route path="rh" element={gate(DESK, HrPage)} />
              <Route path="calendrier-equipe" element={gate(DESK, TeamCalendarPage)} />
              <Route path="performance" element={gate(ADMIN, PerformancePage)} />
              <Route path="paiements" element={gate(DESK, PaymentsPage)} />
              <Route path="finance" element={gate(ADMIN, FinancePage)} />
              <Route path="promos" element={gate(ADMIN, PromosPage)} />
              <Route path="offres" element={gate(DESK, PlansPage)} />
              <Route path="equipe" element={gate(ADMIN, TeamPage)} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Route>
    </Routes>
  );
}
