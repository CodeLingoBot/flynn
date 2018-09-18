import * as React from 'react';
import * as jspb from 'google-protobuf';
import Heading from 'grommet/components/Heading';
import Accordion from 'grommet/components/Accordion';
import AccordionPanel from 'grommet/components/AccordionPanel';
import Notification from 'grommet/components/Notification';

import protoMapDiff, { applyProtoMapDiff } from './util/protoMapDiff';
import protoMapReplace from './util/protoMapReplace';
import withClient, { ClientProps } from './withClient';
import { ServiceError } from './generated/controller_pb_service';
import { App, Release } from './generated/controller_pb';
import EnvEditor from './EnvEditor';

export interface Props extends ClientProps {
	app: App;
	release: Release;
}

interface State {
	envPersisting: boolean;
	releaseError: ServiceError | null;
	release: Release | null; // TODO(jvatic): trigger invalidation of app and release in parent component... maybe use a cache to load things through with invalidation
}

class AppComponent extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			envPersisting: false,
			releaseError: null,
			release: null
		};
		this._envPersistHandler = this._envPersistHandler.bind(this);
	}

	public render() {
		const { app } = this.props;
		const { envPersisting, releaseError } = this.state;
		const release = this.state.release || this.props.release;
		return (
			<React.Fragment>
				<Heading>{app.getDisplayName()}</Heading>
				<Accordion openMulti={true} animate={false} active={0}>
					<AccordionPanel heading="Environment">
						{releaseError ? <Notification status="warning" message={releaseError.message} /> : null}
						<EnvEditor
							entries={release.getEnvMap().getEntryList()}
							persist={this._envPersistHandler}
							persisting={envPersisting}
						/>
					</AccordionPanel>
				</Accordion>
			</React.Fragment>
		);
	}

	private _envPersistHandler(next: Array<[string, string]>) {
		const { client, app, release } = this.props;
		const envDiff = protoMapDiff(release.getEnvMap(), new jspb.Map(next));
		this.setState({
			envPersisting: true
		});
		client
			.getApp(app.getName())
			.then((app) => {
				return client.getRelease(app.getRelease());
			})
			.then((release) => {
				const newRelease = new Release();
				newRelease.setArtifactsList(release.getArtifactsList());
				protoMapReplace(newRelease.getLabelsMap(), release.getLabelsMap());
				protoMapReplace(newRelease.getProcessesMap(), release.getProcessesMap());
				protoMapReplace(newRelease.getEnvMap(), applyProtoMapDiff(release.getEnvMap(), envDiff));
				return client.createRelease(app.getName(), newRelease);
			})
			.then((release) => {
				return client.createDeployment(app.getName(), release.getName()).then((deployment) => {
					console.log('deployment', deployment);
					this.setState({
						release,
						envPersisting: false
					});
				});
			})
			.catch((error: ServiceError) => {
				this.setState({
					releaseError: error
				});
			});
	}
}
export default withClient(AppComponent);