/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com).
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Alert, Box, Button, CircularProgress, Drawer, IconButton, Stack, Typography } from '@wso2/oxygen-ui';
import TextField from '../../common/TextField';
import { Plus, Trash2, X } from '@wso2/oxygen-ui-icons-react';
import { useState } from 'react';
import { useTriggerComponent } from '../../../hooks/useExecutions';
import type { RuntimeArgument, TriggerArgument } from '../../../types/executions';

export interface RunWithArgsDialogProps {
  open: boolean;
  onClose: () => void;
  onRunSuccess?: (args: string[]) => void;
  envCritical?: boolean | null;
  orgHandler: string;
  projectId: string;
  componentId: string;
  releaseId: string;
  /** Arguments the program declares, in the order it reads them. Each gets a row labelled with its name. */
  runtimeArguments?: RuntimeArgument[];
}

const REQUIRED_ERROR = 'This argument is required';
const GAP_ERROR = 'Enter a value: arguments are passed in order, and a later one has a value';

const isFilled = (value: string | undefined): boolean => (value ?? '').trim() !== '';

function placeholderFor(arg: RuntimeArgument): string {
  const kind = arg.values?.length ? arg.values.join(' | ') : arg.type;
  return arg.required ? kind : `${kind} (optional)`;
}

/**
 * Declared arguments are positional, so the run gets every declared value up to the last
 * filled one, then the added ones. An empty declared value before a filled value would
 * hand that value to the wrong parameter; an empty required one leaves the program
 * without its value. Added rows keep their free-form behaviour: blanks are dropped.
 */
function validateDeclared(declared: RuntimeArgument[], values: string[], extra: string[]): Record<number, string> {
  const errors: Record<number, string> = {};
  const anyExtra = extra.some(isFilled);
  let lastFilled = -1;
  declared.forEach((_, i) => {
    if (isFilled(values[i])) lastFilled = i;
  });
  declared.forEach((arg, i) => {
    if (isFilled(values[i])) return;
    if (arg.required) errors[i] = REQUIRED_ERROR;
    else if (anyExtra || i < lastFilled) errors[i] = GAP_ERROR;
  });
  return errors;
}

function buildArgs(declared: RuntimeArgument[], values: string[], extra: string[]): TriggerArgument[] {
  let end = declared.length;
  while (end > 0 && !isFilled(values[end - 1])) end -= 1;
  const named = declared.slice(0, end).map((arg, i) => ({ argument_name: arg.name, argument_value: values[i] ?? '' }));
  return [...named, ...extra.filter(isFilled).map((value) => ({ argument_name: '', argument_value: value }))];
}

export default function RunWithArgsDialog({ open, onClose, onRunSuccess, orgHandler, projectId, componentId, releaseId, runtimeArguments = [] }: RunWithArgsDialogProps) {
  const initialExtra = runtimeArguments.length > 0 ? [] : [''];
  const [values, setValues] = useState<string[]>([]);
  const [args, setArgs] = useState<string[]>(initialExtra);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const trigger = useTriggerComponent();

  const handleAddArg = () => setArgs((prev) => [...prev, '']);

  const handleRemoveArg = (index: number) => setArgs((prev) => prev.filter((_, i) => i !== index));

  const handleChange = (index: number, val: string) => {
    setArgs((prev) => prev.map((arg, i) => (i === index ? val : arg)));
  };

  const handleDeclaredChange = (index: number, val: string) => {
    setValues((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
    setErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  };

  const execArgs = buildArgs(runtimeArguments, values, args);

  const handleRun = () => {
    setRunError(null);
    const found = validateDeclared(runtimeArguments, values, args);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    trigger.mutate(
      { orgHandler, projectId, componentId, releaseId, args: execArgs },
      {
        onSuccess: () => {
          const resolvedArgs = execArgs.map((a) => a.argument_value);
          handleClose();
          onRunSuccess?.(resolvedArgs);
        },
        onError: (err) => setRunError(err instanceof Error ? err.message : 'Failed to execute'),
      },
    );
  };

  const handleClose = () => {
    (document.activeElement as HTMLElement)?.blur();
    setValues([]);
    setArgs(initialExtra);
    setErrors({});
    setRunError(null);
    onClose();
  };

  const previewJson = JSON.stringify(execArgs.map((a) => a.argument_value));
  // Declared rows hold their place in the order, so only added rows can be removed.
  const removable = runtimeArguments.length > 0 || args.length > 1;

  const drawerSx = {
    '& .MuiDrawer-paper': {
      width: 440,
      position: 'fixed',
      top: 64,
      height: 'calc(100% - 64px)',
      borderLeft: '1px solid',
      borderColor: 'divider',
      display: 'flex',
      flexDirection: 'column',
    },
  };

  return (
    <Drawer anchor="right" open={open} onClose={handleClose} variant="temporary" sx={drawerSx}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Typography variant="h5">Runtime Arguments</Typography>
        <IconButton size="small" aria-label="close" onClick={handleClose}>
          <X size={16} />
        </IconButton>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto', px: 2, py: 2 }}>
        <Stack gap={1.5}>
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
              Arguments
            </Typography>
            <Box sx={{ bgcolor: 'action.hover', borderRadius: 1, px: 1.5, py: 1, fontFamily: 'monospace', fontSize: '0.75rem', wordBreak: 'break-all' }}>{previewJson}</Box>
          </Box>

          {runtimeArguments.map((arg, index) => (
            <Stack key={arg.name} gap={0.5}>
              <Typography variant="caption" color="text.secondary">
                {arg.displayName ?? arg.name}
                {arg.required && (
                  <Typography component="span" variant="caption" sx={{ color: 'error.main' }}>
                    {' '}
                    *
                  </Typography>
                )}
              </Typography>
              {arg.description && (
                <Typography variant="caption" color="text.secondary">
                  {arg.description}
                </Typography>
              )}
              <Stack direction="row" gap={1} alignItems="flex-start">
                <TextField size="small" fullWidth placeholder={placeholderFor(arg)} value={values[index] ?? ''} error={index in errors} helperText={errors[index]} onChange={(e) => handleDeclaredChange(index, e.target.value)} />
                <IconButton size="small" aria-label="Remove argument" disabled sx={{ mt: 0.5 }}>
                  <Trash2 size={14} />
                </IconButton>
              </Stack>
            </Stack>
          ))}

          {args.map((arg, index) => (
            <Stack key={index} gap={0.5}>
              <Typography variant="caption" color="text.secondary">
                Arg {runtimeArguments.length + index + 1}
              </Typography>
              <Stack direction="row" gap={1} alignItems="center">
                <TextField size="small" fullWidth placeholder="Enter the argument" value={arg} onChange={(e) => handleChange(index, e.target.value)} />
                <IconButton size="small" aria-label="Remove argument" disabled={!removable} onClick={() => handleRemoveArg(index)}>
                  <Trash2 size={14} />
                </IconButton>
              </Stack>
            </Stack>
          ))}
        </Stack>

        <Button variant="text" size="small" startIcon={<Plus size={14} />} onClick={handleAddArg} sx={{ mt: 1.5, px: 0 }}>
          Add Argument
        </Button>

        {runError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {runError}
          </Alert>
        )}
      </Box>

      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ px: 2, py: 1.5, borderTop: '1px solid', borderColor: 'divider', flexShrink: 0 }}>
        <Button onClick={handleClose}>Cancel</Button>
        <Button variant="contained" onClick={handleRun} disabled={trigger.isPending || !releaseId} startIcon={trigger.isPending ? <CircularProgress color="inherit" size={16} /> : undefined}>
          {trigger.isPending ? 'Executing…' : 'Execute'}
        </Button>
      </Stack>
    </Drawer>
  );
}
