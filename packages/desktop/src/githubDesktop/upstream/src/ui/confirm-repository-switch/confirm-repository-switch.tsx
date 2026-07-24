import * as React from 'react'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import { Checkbox, CheckboxValue } from '../lib/checkbox'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'

interface IConfirmRepositorySwitchProps {
  readonly repository: Repository | CloningRepository
  readonly onConfirmation: (
    repository: Repository | CloningRepository,
    switchNoteWorkspace: boolean
  ) => Promise<void>
  readonly onDismissed: () => void
}

interface IConfirmRepositorySwitchState {
  readonly isSwitching: boolean
  readonly switchNoteWorkspace: boolean
}

export class ConfirmRepositorySwitch extends React.Component<
  IConfirmRepositorySwitchProps,
  IConfirmRepositorySwitchState
> {
  public constructor(props: IConfirmRepositorySwitchProps) {
    super(props)

    this.state = {
      isSwitching: false,
      switchNoteWorkspace: true,
    }
  }

  public render() {
    const isSwitching = this.state.isSwitching
    const canSwitchNoteWorkspace = this.props.repository instanceof Repository

    return (
      <Dialog
        id="confirm-repository-switch"
        key="repository-switch-confirmation"
        title={__DARWIN__ ? 'Switch Repository?' : 'Switch repository?'}
        dismissDisabled={isSwitching}
        loading={isSwitching}
        disabled={isSwitching}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
      >
        <DialogContent>
          <p>Are you sure you want to switch to this repository?</p>
          <div className="description">
            <p>Repository:</p>
            <p>
              <Ref>{this.props.repository.path}</Ref>
            </p>
          </div>

          {canSwitchNoteWorkspace && (
            <Checkbox
              label="Also switch notes workspace to this repository"
              value={
                this.state.switchNoteWorkspace
                  ? CheckboxValue.On
                  : CheckboxValue.Off
              }
              onChange={this.onSwitchNoteWorkspaceChanged}
            />
          )}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText="Switch"
            okButtonDisabled={isSwitching}
            cancelButtonDisabled={isSwitching}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const shouldSwitchNoteWorkspace =
      this.props.repository instanceof Repository &&
      this.state.switchNoteWorkspace

    this.setState({ isSwitching: true })

    await this.props.onConfirmation(
      this.props.repository,
      shouldSwitchNoteWorkspace
    )

    this.props.onDismissed()
  }

  private onSwitchNoteWorkspaceChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    this.setState({ switchNoteWorkspace: event.currentTarget.checked })
  }
}
