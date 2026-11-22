import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout               from './components/Layout'
import HomePage             from './components/Home'
import BatchPayoutPage      from './components/BatchPayout'
import VestingPage          from './components/VestingStream'
import SplitPage            from './components/BillSplitter'
import InvoicePage          from './components/InvoiceGenerator'

import SwapPage             from './components/SwapPage'
import BridgePage           from './components/BridgePage'
import EscrowPage           from './components/EscrowPage'
import DocsPage             from './components/Docs'
import DashboardPage        from './components/Portfolio'
import PersonalOverviewPage from './components/PersonalOverview'
import HistoryPage          from './components/History'
import SettingsPage         from './components/Settings'
import NotFound             from './components/NotFound'
import PrivacyPage          from './components/Privacy'
import TermsPage            from './components/Terms'

/** The old Approvals page now lives on the Payouts page. Keep the query string so shared proposal links still work. */
function MultisigRedirect() {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  params.set('tab', 'approvals')
  return <Navigate to={`/pay?${params.toString()}`} replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/"             element={<HomePage />} />
          <Route path="/pay"          element={<BatchPayoutPage />} />
          <Route path="/vesting"      element={<VestingPage />} />
          <Route path="/my-streams"   element={<Navigate to="/dashboard?tab=streams"  replace />} />
          <Route path="/receipts"     element={<Navigate to="/dashboard?tab=receipts" replace />} />
          <Route path="/split"        element={<SplitPage />} />
          <Route path="/invoice"      element={<InvoicePage />} />
          <Route path="/pay-invoice"  element={<InvoicePage />} />
          <Route path="/swap"         element={<SwapPage />} />
          <Route path="/bridge"       element={<BridgePage />} />
          <Route path="/escrow"       element={<EscrowPage />} />
          <Route path="/multisig"     element={<MultisigRedirect />} />
          <Route path="/invoice-dashboard" element={<Navigate to="/dashboard?tab=invoices" replace />} />
          <Route path="/dashboard"    element={<DashboardPage />} />
          <Route path="/personal"     element={<PersonalOverviewPage />} />
          <Route path="/history"      element={<HistoryPage />} />
          <Route path="/settings"     element={<SettingsPage />} />
          <Route path="/docs"         element={<DocsPage />} />
          <Route path="/privacy"      element={<PrivacyPage />} />
          <Route path="/terms"        element={<TermsPage />} />
          <Route path="*"             element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
