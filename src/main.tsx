import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { BudgetProvider } from './store/BudgetContext';
import { AuthProvider } from './store/AuthContext';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <BudgetProvider>
        <App />
      </BudgetProvider>
    </AuthProvider>
  </StrictMode>,
);
