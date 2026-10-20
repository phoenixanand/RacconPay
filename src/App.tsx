import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout               from './components/Layout'
import HomePage             from './components/Home'
import BatchPayoutPage      from './components/BatchPayout'
import VestingPage          from './components/VestingStream'
import SplitPage            from './components/BillSplitter'
import InvoicePage          from './components/InvoiceGenerator'

import MultiSigPage         from './components/MultiSigPayoutPage'
import DocsPage             from './components/Docs'
import DashboardPage        from './components/Portfolio'
import NotFound             from './components/NotFound'
import PrivacyPage          from './components/Privacy'
import TermsPage            from './components/Terms'

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
          <Route path="/multisig"     element={<MultiSigPage />} />
          <Route path="/invoice-dashboard" element={<Navigate to="/dashboard?tab=invoices" replace />} />
          <Route path="/dashboard"    element={<DashboardPage />} />
          <Route path="/docs"         element={<DocsPage />} />
          <Route path="/privacy"      element={<PrivacyPage />} />
          <Route path="/terms"        element={<TermsPage />} />
          <Route path="*"             element={<NotFound />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}
