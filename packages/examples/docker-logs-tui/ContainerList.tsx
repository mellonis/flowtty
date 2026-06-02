/** @jsxImportSource react */
import React from 'react';
import { Box, Table, type TableColumn, type TableCellStyle } from '@flowtty/react';
import type { Container } from './types.js';

interface ContainerListProps {
  containers: Container[];
  selectedIndex: number;
  width?: number;
}

export function ContainerList({ containers, selectedIndex, width = 30 }: ContainerListProps) {
  // Dim everything but running containers, so stopped ones read as inactive.
  const dimIfStopped = (c: Container): TableCellStyle | undefined =>
    c.state === 'running' ? undefined : { dim: true };

  const columns: TableColumn<Container>[] = [
    { accessor: 'name', header: 'container', cellStyle: dimIfStopped },
    { accessor: 'status', header: 'status', cellStyle: dimIfStopped },
  ];

  return (
    <Box flexDirection="column" width={width} height="100%">
      <Table data={containers} columns={columns} selectedIndex={selectedIndex} scrollable />
    </Box>
  );
}
