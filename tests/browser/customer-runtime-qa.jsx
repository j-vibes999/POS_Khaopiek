import React from 'react';
import { createRoot } from 'react-dom/client';
import LanCustomer from '../../src/LanCustomer.jsx';
import '../../src/customer.css';

createRoot(document.getElementById('root')).render(<LanCustomer table="1" initialLanguage="en"/>);
