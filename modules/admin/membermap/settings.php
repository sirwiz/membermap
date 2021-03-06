<?php

/**
 * @brief		Settings Controller
 * @author		<a href='http://ipb.silvesterwebdesigns.com'>Stuart Silvester & Martin Aronsen</a>
 * @copyright	(c) 2015 Stuart Silvester & Martin Aronsen
 * @package		IPS Social Suite
 * @subpackage	Member Map
 * @since		20 Oct 2015
 * @version		3.0.1
 */

namespace IPS\membermap\modules\admin\membermap;

/* To prevent PHP errors (extending class does not exist) revealing path */
if ( !defined( '\IPS\SUITE_UNIQUE_KEY' ) )
{
	header( ( isset( $_SERVER['SERVER_PROTOCOL'] ) ? $_SERVER['SERVER_PROTOCOL'] : 'HTTP/1.0' ) . ' 403 Forbidden' );
	exit;
}

/**
 * settings
 */
class _settings extends \IPS\Dispatcher\Controller
{
	/**
	 * Execute
	 *
	 * @return	void
	 */
	public function execute()
	{
		\IPS\Dispatcher::i()->checkAcpPermission( 'settings_manage' );
		parent::execute();
	}

	/**
	 * ...
	 *
	 * @return	void
	 */
	protected function manage()
	{
		\IPS\Output::i()->title = \IPS\Member::loggedIn()->language()->addToStack('menu__membermap_membermap_settings');

		\IPS\Output::i()->jsFiles = array_merge( \IPS\Output::i()->jsFiles, \IPS\Output::i()->js( 'jquery/jquery-ui.js', 'membermap', 'interface' ) );
		\IPS\Output::i()->jsFiles = array_merge( \IPS\Output::i()->jsFiles, \IPS\Output::i()->js( 'admin_membermap.js', 'membermap', 'admin' ) );
		\IPS\Output::i()->cssFiles = array_merge( \IPS\Output::i()->cssFiles, \IPS\Theme::i()->css( 'jquery-ui.css', 'membermap', 'global' ) );
		
		\IPS\Output::i()->jsVars['membermap_mapquestAPI'] = \IPS\membermap\Application::getApiKeys( 'mapquest' ); 

		$form = new \IPS\Helpers\Form;

		$form->addHeader('api_settings');
		$form->add( new \IPS\Helpers\Form\Text( 'membermap_mapQuestAPI', \IPS\Settings::i()->membermap_mapQuestAPI, TRUE, array(), NULL, NULL, NULL, 'membermap_mapQuestAPI' ) );

		if ( ! empty( \IPS\Settings::i()->membermap_mapQuestAPI ) )
		{
			$form->attributes['data-controller'] 	= 'membermap.admin.membermap.settings';
			$form->attributes['id'] 				= 'membermap_form_settings';

			$form->addHeader('map_settings');
			$form->add( new \IPS\Helpers\Form\YesNo( 'membermap_groupByMemberGroup', \IPS\Settings::i()->membermap_groupByMemberGroup ) );
			$form->add( new \IPS\Helpers\Form\YesNo( 'membermap_enable_clustering', \IPS\Settings::i()->membermap_enable_clustering ) );
			$form->add( new \IPS\Helpers\Form\Text( 'membermap_bbox_location', \IPS\Settings::i()->membermap_bbox_location, FALSE, array(), NULL, NULL, NULL, 'membermap_bbox_location' ) );
			$form->add( new \IPS\Helpers\Form\Number( 'membermap_bbox_zoom', intval( \IPS\Settings::i()->membermap_bbox_zoom ), FALSE, array( 'min' => 1, 'max' => 18 ) ) );
			$form->hiddenValues['membermap_bbox'] = \IPS\Settings::i()->membermap_bbox;

			$form->addHeader( 'membermap_autoUpdate' );

			$profileFields = array( '' => ' -- ' . \IPS\Member::loggedIn()->language()->addToStack( 'membermap_profileLocationField' ) . ' -- ' );
			foreach ( \IPS\core\ProfileFields\Field::fields( array(), \IPS\core\ProfileFields\Field::PROFILE ) as $group => $fields )
			{
				foreach ( $fields as $id => $field )
				{
					$profileFields[ 'core_pfieldgroups_' . $group ][ $id ] = $field->name;
				}
			}

			$form->add( new \IPS\Helpers\Form\YesNo( 'membermap_monitorLocationField', \IPS\Settings::i()->membermap_monitorLocationField, FALSE, 
				array( 'togglesOn' => array( 'membermap_profileLocationField', 'membermap_monitorLocationField_groupPerm', 'membermap_syncLocationField' ) ) 
			) );

			$form->add( new \IPS\Helpers\Form\Select( 
				'membermap_profileLocationField', 
				\IPS\Settings::i()->membermap_profileLocationField ? intval( \IPS\Settings::i()->membermap_profileLocationField ) : NULL, 
				FALSE, array( 'options' => $profileFields ), NULL, NULL, NULL, 'membermap_profileLocationField' 
			) );

			$form->add( new \IPS\Helpers\Form\Select(
	            'membermap_monitorLocationField_groupPerm',
	            \IPS\Settings::i()->membermap_monitorLocationField_groupPerm != '' ? ( \IPS\Settings::i()->membermap_monitorLocationField_groupPerm === '*' ? '*' : explode( ",", \IPS\Settings::i()->membermap_monitorLocationField_groupPerm ) ) : '*',
	            FALSE,array( 'options' => \IPS\Member\Group::groups(), 'multiple' => TRUE, 'parse' => 'normal', 'unlimited' => '*', 'unlimitedLang' => 'all' ), NULL, NULL, NULL, 'membermap_monitorLocationField_groupPerm'
	        ) );

	        $form->add( new \IPS\Helpers\Form\YesNo( 'membermap_syncLocationField', \IPS\Settings::i()->membermap_syncLocationField, FALSE, array(), NULL, NULL, NULL, 'membermap_syncLocationField' ) );
		}

		if ( $values = $form->values( TRUE ) )
		{
			$values['membermap_bbox'] = \IPS\Request::i()->membermap_bbox;

			if ( empty( $values['membermap_bbox_location'] ) )
			{
				$values['membermap_bbox'] = "";
			}

			\IPS\DB::i()->update( 'core_tasks', array( 'enabled' => isset( $values['membermap_syncLocationField'] ) AND $values['membermap_syncLocationField'] ? 1 : 0 ), array( '`key`=?', 'locationSync' ) );


			$form->saveAsSettings( $values );
			\IPS\Session::i()->log( 'acplogs__membermap_settings' );

			\IPS\Output::i()->redirect( \IPS\Http\Url::internal( "app=membermap&module=membermap&controller=settings" ), 'saved' );
		}
		
		\IPS\Output::i()->output = $form;
	}
}