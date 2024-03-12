import { createContext } from 'react';

interface DataSourceMenuProperties {
  dataSourceId: string;
  dataSourceLabel: string;
}

const DataSourceMenuContext = createContext<DataSourceMenuProperties>({
  dataSourceId: '',
  dataSourceLabel: '',
});

export {DataSourceMenuContext}
